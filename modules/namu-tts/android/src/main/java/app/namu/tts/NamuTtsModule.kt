package app.namu.tts

import android.app.ActivityManager
import android.content.ComponentCallbacks2
import android.content.Context
import android.content.res.Configuration
import android.os.Build
import android.os.Debug
import android.util.Log
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest

class ModelFileMissing(name: String) : CodedException("E_MISSING_FILE", "Model file is missing: $name", null)
class ModelNotLoaded : CodedException("E_NOT_LOADED", "No model is loaded", null)
class ModelLoadFailed(cause: Throwable) : CodedException("E_LOAD_FAILED", "Model could not be loaded: ${cause.message}", cause)
class OutOfMemory(cause: Throwable) : CodedException("E_OUT_OF_MEMORY", "Not enough memory: ${cause.message}", cause)
class SynthFailed(cause: Throwable) : CodedException("E_SYNTH_FAILED", "Synthesis failed: ${cause.message}", cause)

/**
 * Local Korean speech for Namu: Supertonic 3 on ONNX Runtime. Text never leaves the device;
 * the network is only used to download the voice pack the user asked for.
 * Only one engine exists at a time and every use of it is serialized.
 */
class NamuTtsModule : Module() {
  private val lock = Any()
  private var engine: SupertonicEngine? = null
  private var engineDir: File? = null
  private var engineFold = false
  private val styles = mutableMapOf<String, VoiceStyle>()
  private val player = Player()
  private var callbacks: ComponentCallbacks2? = null

  private fun path(p: String) = File(p.removePrefix("file://"))

  private fun context(): Context = appContext.reactContext ?: throw CodedException("E_CONTEXT", "Android context unavailable", null)

  private fun memory(): Map<String, Any?> {
    var rss = 0.0
    var peak = 0.0
    runCatching {
      File("/proc/self/status").forEachLine { line ->
        if (line.startsWith("VmRSS:")) rss = line.trim().split(Regex("\\s+"))[1].toDouble() / 1024
        if (line.startsWith("VmHWM:")) peak = line.trim().split(Regex("\\s+"))[1].toDouble() / 1024
      }
    }
    return mapOf("rssMb" to rss, "peakMb" to peak, "nativeHeapMb" to Debug.getNativeHeapAllocatedSize() / 1048576.0)
  }

  private fun releaseEngine() {
    synchronized(lock) {
      engine?.close()
      engine = null
      engineDir = null
      styles.clear()
    }
  }

  override fun definition() = ModuleDefinition {
    Name("NamuTts")

    Events("onDownloadProgress", "onEngineReleased")

    OnCreate {
      // When Android runs low on memory the model (hundreds of MB) is the first thing to give back.
      val cb = object : ComponentCallbacks2 {
        override fun onTrimMemory(level: Int) {
          @Suppress("DEPRECATION")
          if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW && engine != null) {
            Log.i(TTS_LOG_TAG, "Releasing engine on memory pressure, level $level")
            releaseEngine()
            sendEvent("onEngineReleased", mapOf("reason" to "memory", "level" to level))
          }
        }
        override fun onConfigurationChanged(newConfig: Configuration) {}
        @Deprecated("Deprecated in Java")
        override fun onLowMemory() = onTrimMemory(ComponentCallbacks2.TRIM_MEMORY_COMPLETE)
      }
      appContext.reactContext?.applicationContext?.registerComponentCallbacks(cb)
      callbacks = cb
    }

    OnDestroy {
      callbacks?.let { appContext.reactContext?.applicationContext?.unregisterComponentCallbacks(it) }
      player.stop()
      releaseEngine()
    }

    /** App-private storage that survives updates and is left out of Android cloud backup. */
    Function("storageDir") { context().noBackupFilesDir.absolutePath }

    AsyncFunction("deviceInfo") {
      val am = context().getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
      val mi = ActivityManager.MemoryInfo().also { am?.getMemoryInfo(it) }
      mapOf(
        "sdk" to Build.VERSION.SDK_INT,
        "abis" to Build.SUPPORTED_ABIS.joinToString(),
        "cores" to Runtime.getRuntime().availableProcessors(),
        "totalRamMb" to mi.totalMem / 1048576.0,
        "availRamMb" to mi.availMem / 1048576.0,
        "lowRamDevice" to (am?.isLowRamDevice ?: false),
        "lowMemory" to mi.lowMemory,
      )
    }

    AsyncFunction("memory") { memory() }

    /** What the synthesis queue needs to decide whether to work now. */
    AsyncFunction("conditions") {
      val ctx = context()
      val bm = ctx.getSystemService(Context.BATTERY_SERVICE) as? android.os.BatteryManager
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
      val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
      val mi = ActivityManager.MemoryInfo().also { am?.getMemoryInfo(it) }
      mapOf(
        "battery" to (bm?.getIntProperty(android.os.BatteryManager.BATTERY_PROPERTY_CAPACITY) ?: -1),
        "charging" to (bm?.isCharging ?: false),
        "powerSave" to (pm?.isPowerSaveMode ?: false),
        // 0 none … 3 severe, 4+ critical (Android 10+); -1 unknown.
        "thermal" to (if (Build.VERSION.SDK_INT >= 29) pm?.currentThermalStatus ?: -1 else -1),
        "availRamMb" to mi.availMem / 1048576.0,
        "lowMemory" to mi.lowMemory,
      )
    }

    AsyncFunction("freeSpaceMb") { dir: String ->
      val f = path(dir).let { if (it.exists()) it else it.parentFile ?: it }
      f.usableSpace / 1048576.0
    }

    AsyncFunction("sha256") { file: String ->
      val f = path(file)
      if (!f.exists()) throw ModelFileMissing(f.name)
      val md = MessageDigest.getInstance("SHA-256")
      f.inputStream().use { input ->
        val buf = ByteArray(1 shl 20)
        while (true) {
          val n = input.read(buf)
          if (n < 0) break
          md.update(buf, 0, n)
        }
      }
      md.digest().joinToString("") { "%02x".format(it) }
    }

    AsyncFunction("download") { url: String, dest: String, expectedSize: Double ->
      try {
        Downloader.download(url, path(dest), expectedSize.toLong()) { bytes, total ->
          sendEvent("onDownloadProgress", mapOf("dest" to dest, "bytes" to bytes.toDouble(), "total" to total.toDouble()))
        }.toDouble()
      } catch (e: Downloader.HttpError) {
        throw CodedException("E_HTTP_${e.status}", e.message, e)
      } catch (e: InterruptedException) {
        throw CodedException("E_CANCELLED", "Download cancelled", e)
      } catch (e: java.io.IOException) {
        throw CodedException("E_NETWORK", "Network error: ${e.message}", e)
      }
    }

    Function("cancelDownload") { Downloader.cancelled = true }

    // Small file helpers for the voice pack and cache folders (all inside storageDir).
    AsyncFunction("fileSize") { file: String -> path(file).let { if (it.isFile) it.length().toDouble() else -1.0 } }

    AsyncFunction("exists") { file: String -> path(file).exists() }

    AsyncFunction("readText") { file: String -> path(file).let { if (it.isFile) it.readText() else null } }

    /** Writes a small text file through a temporary file and a rename. */
    AsyncFunction("writeTextAtomic") { file: String, text: String ->
      val f = path(file)
      f.parentFile?.mkdirs()
      val tmp = File(f.parentFile, "${f.name}.part")
      java.io.FileOutputStream(tmp).use { out ->
        out.write(text.toByteArray())
        out.fd.sync()
      }
      if (!tmp.renameTo(f)) {
        tmp.delete()
        throw CodedException("E_IO", "Could not write ${f.name}", null)
      }
      true
    }

    /** Renames a folder in one step; fails if the target exists. */
    AsyncFunction("moveDir") { from: String, to: String ->
      val a = path(from)
      val b = path(to)
      if (b.exists()) throw CodedException("E_IO", "Target exists: ${b.name}", null)
      b.parentFile?.mkdirs()
      if (!a.renameTo(b)) throw CodedException("E_IO", "Could not move ${a.name}", null)
      true
    }

    /** Unpacks a .gz file through a temporary file and a rename; returns the unpacked size. */
    AsyncFunction("gunzip") { from: String, to: String ->
      val out = path(to)
      out.parentFile?.mkdirs()
      val tmp = File(out.parentFile, "${out.name}.part")
      java.util.zip.GZIPInputStream(path(from).inputStream().buffered(1 shl 16)).use { input ->
        java.io.FileOutputStream(tmp).use { o ->
          input.copyTo(o, 1 shl 16)
          o.fd.sync()
        }
      }
      if (!tmp.renameTo(out)) {
        tmp.delete()
        throw CodedException("E_IO", "Could not move ${out.name}", null)
      }
      out.length().toDouble()
    }

    /** Copies a file through a temporary file and a rename (reusing unchanged pack files on update). */
    AsyncFunction("copyFile") { from: String, to: String ->
      val a = path(from)
      val b = path(to)
      if (!a.isFile) throw ModelFileMissing(a.name)
      b.parentFile?.mkdirs()
      val tmp = File(b.parentFile, "${b.name}.part")
      a.inputStream().use { input -> java.io.FileOutputStream(tmp).use { o -> input.copyTo(o, 1 shl 20); o.fd.sync() } }
      if (!tmp.renameTo(b)) {
        tmp.delete()
        throw CodedException("E_IO", "Could not move ${b.name}", null)
      }
      b.length().toDouble()
    }

    AsyncFunction("deleteTree") { file: String -> path(file).deleteRecursively() }

    AsyncFunction("listDir") { dir: String -> path(dir).list()?.toList() ?: emptyList<String>() }

    AsyncFunction("dirSize") { dir: String -> path(dir).walkTopDown().filter { it.isFile }.sumOf { it.length() }.toDouble() }

    AsyncFunction("isLoaded") { dir: String, fold: Boolean ->
      synchronized(lock) { engine != null && engineDir == path(dir) && engineFold == fold }
    }

    AsyncFunction("load") { dir: String, threads: Int, fold: Boolean ->
      synchronized(lock) {
        if (engine != null && engineDir == path(dir) && engineFold == fold) {
          return@AsyncFunction mapOf("loadMs" to 0.0, "memory" to memory())
        }
        engine?.close(); engine = null; engineDir = null; styles.clear()
        System.gc()
        Log.i(TTS_LOG_TAG, "Loading model: threads=$threads, fold=$fold")
        val t0 = System.nanoTime()
        try {
          engine = SupertonicEngine(path(dir), threads, fold)
          engineDir = path(dir)
          engineFold = fold
        } catch (e: CodedException) {
          throw e
        } catch (e: OutOfMemoryError) {
          System.gc()
          throw OutOfMemory(e)
        } catch (e: Throwable) {
          throw ModelLoadFailed(e)
        }
        mapOf("loadMs" to (System.nanoTime() - t0) / 1e6, "memory" to memory())
      }
    }

    /** Synthesizes text into a WAV file (written atomically). The text is not logged. */
    AsyncFunction("synthToFile") { text: String, voice: String, steps: Int, speed: Double, seed: Double, out: String ->
      synchronized(lock) {
        val e = engine ?: throw ModelNotLoaded()
        val dir = engineDir ?: throw ModelNotLoaded()
        if (!Regex("^[A-Za-z0-9_-]{1,32}$").matches(voice)) throw ModelFileMissing("voice_styles/$voice.json")
        try {
          val style = styles.getOrPut(voice) { e.loadStyle(File(dir, "voice_styles/$voice.json")) }
          val r = e.synth(text, style, steps, speed, seed.toLong())
          Wav.write(path(out), Loudness.normalize(r.audio, r.sampleRate), r.sampleRate)
          mapOf("audioSec" to r.audio.size.toDouble() / r.sampleRate, "totalMs" to r.totalMs)
        } catch (err: OutOfMemoryError) {
          throw OutOfMemory(err)
        } catch (err: CodedException) {
          throw err
        } catch (err: Throwable) {
          throw SynthFailed(err)
        }
      }
    }

    AsyncFunction("release") {
      releaseEngine()
      System.gc()
      memory()
    }

    /** Starts playing a WAV file; resolves with its duration once playback has started. */
    AsyncFunction("playFile") { file: String ->
      val f = path(file)
      if (!f.exists()) throw ModelFileMissing(f.name)
      try {
        player.play(f)
      } catch (e: Throwable) {
        throw CodedException("E_PLAYBACK", "Playback failed: ${e.message}", e)
      }
    }

    Function("stopPlayback") { player.stop() }
  }
}
