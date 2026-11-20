package app.namu.onnxtts

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.Debug
import android.os.IBinder
import android.os.Process
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlin.concurrent.thread

/**
 * Owns its ONNX session independently of the React Native bridge.
 * A user-initiated foreground service keeps the benchmark alive when the Activity is hidden.
 * Status and the completed report are persisted in app-private storage.
 */
class TtsBenchmarkService : Service() {
  companion object {
    private const val CHANNEL = "namu_tts_benchmark"
    private const val NOTIFICATION_ID = 811
    const val ACTION_START = "app.namu.ttslab.BENCH_START"
    const val ACTION_CANCEL = "app.namu.ttslab.BENCH_CANCEL"
    const val EXTRA_OPTIONS = "options"
    private const val STATE_FILE = "tts-benchmark-state.json"
    @Volatile private var cancelled = false
    @Volatile private var running = false

    fun readStatus(dir: File): String {
      val file = File(dir, STATE_FILE)
      return if (file.exists()) file.readText() else """{"state":"idle","done":0,"total":220}"""
    }

    private fun median(values: List<Double>): Double {
      val s = values.sorted()
      return if (s.isEmpty()) 0.0 else s[s.size / 2]
    }

    private fun memory(): JSONObject {
      var rss = 0.0
      var peak = 0.0
      runCatching {
        File("/proc/self/status").forEachLine { line ->
          if (line.startsWith("VmRSS:")) rss = line.trim().split(Regex("\\s+"))[1].toDouble() / 1024
          if (line.startsWith("VmHWM:")) peak = line.trim().split(Regex("\\s+"))[1].toDouble() / 1024
        }
      }
      return JSONObject().put("rssMb", rss).put("peakMb", peak)
        .put("nativeHeapMb", Debug.getNativeHeapAllocatedSize() / 1048576.0)
    }
  }

  private var worker: Thread? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    val manager = getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(NotificationChannel(CHANNEL, "TTS benchmark", NotificationManager.IMPORTANCE_LOW))
  }

  private fun notification(message: String): Notification =
    Notification.Builder(this, CHANNEL)
      .setSmallIcon(applicationInfo.icon)
      .setContentTitle("Namu TTS Lab")
      .setContentText(message)
      .setOngoing(true)
      .build()

  private fun status(state: String, done: Int, label: String, result: JSONObject? = null) {
    val obj = JSONObject().put("state", state).put("done", done)
      .put("total", 220).put("label", label)
      .put("updatedAt", System.currentTimeMillis())
    if (result != null) obj.put("report", result)
    val dest = File(filesDir, STATE_FILE)
    val temp = File(filesDir, "$STATE_FILE.tmp")
    temp.writeText(obj.toString())
    if (!temp.renameTo(dest)) { dest.writeText(obj.toString()); temp.delete() }
    (getSystemService(NOTIFICATION_SERVICE) as NotificationManager)
      .notify(NOTIFICATION_ID, notification(label))
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_CANCEL) {
      cancelled = true
      return START_NOT_STICKY
    }
    if (intent?.action != ACTION_START || running) return START_NOT_STICKY
    val options = intent.getStringExtra(EXTRA_OPTIONS) ?: return START_NOT_STICKY
    try {
      startForeground(NOTIFICATION_ID, notification("Подготовка бенчмарка"))
    } catch (e: Exception) {
      stopSelf()
      return START_NOT_STICKY
    }
    cancelled = false
    running = true
    worker = thread(name = "NamuTtsDualBenchmark") {
      try {
        val config = JSONObject(options)
        val texts = config.getJSONArray("items")
        val runFast = measureMode(config, texts, true, 0)
        if (cancelled) throw InterruptedException("Тест отменён")
        val runLight = measureMode(config, texts, false, 1)
        if (cancelled) throw InterruptedException("Тест отменён")
        val report = JSONObject().put("schema", "namu-tts-lab-dual-benchmark-v1")
          .put("createdAt", System.currentTimeMillis())
          .put("fast", runFast).put("light", runLight)
        status("completed", 220, "Оба бенчмарка завершены", report)
      } catch (e: InterruptedException) {
        status("cancelled", 0, "Тест остановлен")
      } catch (e: Throwable) {
        status("failed", 0, "Ошибка: ${e.message ?: e.javaClass.simpleName}")
      } finally {
        running = false
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf(startId)
      }
    }
    return START_NOT_STICKY
  }

  private fun measureMode(config: JSONObject, texts: JSONArray, fold: Boolean, phase: Int): JSONObject {
    val dir = File(config.getString("packPath").removePrefix("file://"))
    val threads = config.getInt("threads")
    val voice = config.getString("voice")
    val steps = config.getInt("steps")
    val speed = config.getDouble("speed")
    val mode = if (fold) "Быстрый" else "Экономный"
    val errors = JSONArray()
    val samples = Array(texts.length()) { mutableListOf<Double>() }
    val audioSecs = DoubleArray(texts.length())
    val itemParts = arrayOfNulls<JSONObject>(texts.length())
    val before = memory()
    val t0 = System.nanoTime()
    val engine = SupertonicEngine(dir, threads, fold)
    val loadMs = (System.nanoTime() - t0) / 1e6
    val afterLoad = memory()
    try {
      val style = engine.loadStyle(File(dir, "voice_styles/$voice.json"))
      var firstRequestMs = 0.0
      var memRound1 = memory()
      for (round in 0 until 3) {
        for (i in 0 until texts.length()) {
          if (cancelled) throw InterruptedException()
          status("running", phase * 110 + round * texts.length() + i,
            "$mode · круг ${round + 1}/3 · ${i + 1}/${texts.length()}")
          try {
            val r = engine.synth(texts.getJSONObject(i).getString("text"), style, steps, speed, (1000 + i).toLong())
            if (round == 0 && i == 0) firstRequestMs = r.totalMs
            samples[i].add(r.totalMs)
            audioSecs[i] = r.audio.size.toDouble() / r.sampleRate
            if (round == 0) itemParts[i] = JSONObject()
              .put("dpMs", r.dpMs).put("encoderMs", r.encoderMs)
              .put("flowMs", r.flowMs).put("vocoderMs", r.vocoderMs)
          } catch (e: Throwable) {
            errors.put("${texts.getJSONObject(i).getString("id")}: ${e.message}")
          }
        }
        if (round == 0) memRound1 = memory()
      }
      val memRounds = memory()
      // The background benchmark intentionally does not play audio over the user's speakers.
      // Playback latency remains available in the existing foreground/manual benchmark.
      val firstSoundMs = JSONObject.NULL
      val rep = mutableListOf<Double>()
      val rssStart = memory().getDouble("rssMb")
      for (k in 0 until 20) {
        if (cancelled) throw InterruptedException()
        status("running", phase * 110 + 3 * texts.length() + k, "$mode · стабильность ${k + 1}/20")
        try {
          rep.add(engine.synth(texts.getJSONObject(27).getString("text"), style, steps, speed, (5000 + k).toLong()).totalMs)
        } catch (e: Throwable) {
          errors.put("repeat $k: ${e.message}")
        }
      }
      val rssEnd = memory().getDouble("rssMb")
      val items = JSONArray()
      var totalSynth = 0.0
      var totalAudio = 0.0
      for (i in 0 until texts.length()) {
        val item = texts.getJSONObject(i)
        val ms = median(samples[i])
        totalSynth += ms
        totalAudio += audioSecs[i]
        items.put(JSONObject().put("id", item.getString("id")).put("text", item.getString("text"))
          .put("totalMs", JSONArray(samples[i])).put("audioSec", audioSecs[i])
          .put("parts", itemParts[i] ?: JSONObject()))
      }
      val result = JSONObject().put("pack", config.getString("packName"))
        .put("foldWeights", fold).put("threads", threads).put("voice", voice)
        .put("steps", steps).put("speed", speed).put("loadMs", loadMs)
        .put("memoryBefore", before).put("memoryAfterLoad", afterLoad)
        .put("memoryAfterRound1", memRound1).put("memoryAfterRounds", memRounds)
        .put("firstRequestMs", firstRequestMs).put("firstSoundMs", firstSoundMs)
        .put("medianSynthMs", median(samples.map { median(it) }))
        .put("rtf", totalSynth / 1000.0 / maxOf(totalAudio, 0.001))
        .put("stability", JSONObject().put("repeats", rep.size)
          .put("minMs", rep.minOrNull() ?: 0.0).put("maxMs", rep.maxOrNull() ?: 0.0)
          .put("medianMs", median(rep)).put("rssStartMb", rssStart).put("rssEndMb", rssEnd))
        .put("errors", errors).put("items", items)
      return result
    } finally {
      engine.close()
      System.gc()
    }
  }

  override fun onDestroy() {
    cancelled = true
    super.onDestroy()
  }
}
