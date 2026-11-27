package app.namu.tts

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.media.MediaPlayer
import android.media.PlaybackParams
import java.io.File

/** Plays one file at a time (WAV through AudioTrack; .m4a and .webm through MediaPlayer). Starting a new one stops the previous one. */
class Player {
  private var track: AudioTrack? = null
  private var media: MediaPlayer? = null

  /**
   * Starts playback and returns the duration in seconds (at normal speed).
   * speed 1.0 is normal; other values change the tempo and keep the pitch.
   */
  @Synchronized
  fun play(file: File, speed: Float = 1f): Double {
    stop()
    val sp = speed.coerceIn(0.5f, 2f)
    if (!file.name.endsWith(".wav")) return playCompressed(file, sp)
    val pcm = Wav.read(file)
    val t = AudioTrack.Builder()
      .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
      .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(pcm.sampleRate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
      .setTransferMode(AudioTrack.MODE_STATIC)
      .setBufferSizeInBytes(maxOf(pcm.samples.size * 2, 4096))
      .build()
    try {
      t.write(pcm.samples, 0, pcm.samples.size)
      if (sp != 1f) t.playbackParams = PlaybackParams().setSpeed(sp).setPitch(1f)
      t.play()
    } catch (e: Throwable) {
      t.release()
      throw e
    }
    track = t
    return pcm.samples.size.toDouble() / pcm.sampleRate
  }

  /** MediaPlayer now and then fails to open a file it plays fine a moment later: try once more. */
  private fun playCompressed(file: File, speed: Float): Double =
    try {
      playCompressedOnce(file, speed)
    } catch (e: Throwable) {
      android.util.Log.w("NamuTts", "playback: ${e.javaClass.simpleName}, retrying")
      Thread.sleep(60)
      playCompressedOnce(file, speed)
    }

  private fun playCompressedOnce(file: File, speed: Float): Double {
    val m = MediaPlayer()
    try {
      m.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
      m.setDataSource(file.absolutePath)
      m.prepare()
      // Setting the speed starts playback by itself on some devices; start() after it is harmless.
      if (speed != 1f) m.playbackParams = m.playbackParams.setSpeed(speed).setPitch(1f)
      m.start()
    } catch (e: Throwable) {
      m.release()
      throw e
    }
    media = m
    return m.duration / 1000.0
  }

  @Synchronized
  fun stop() {
    track?.let {
      runCatching { it.stop() }
      it.release()
    }
    track = null
    media?.let {
      runCatching { it.stop() }
      it.release()
    }
    media = null
  }
}
