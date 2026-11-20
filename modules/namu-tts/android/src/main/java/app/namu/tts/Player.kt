package app.namu.tts

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import java.io.File

/** Plays one WAV file at a time. Starting a new one stops the previous one. */
class Player {
  private var track: AudioTrack? = null

  /** Starts playback and returns the duration in seconds. */
  @Synchronized
  fun play(file: File): Double {
    stop()
    val pcm = Wav.read(file)
    val t = AudioTrack.Builder()
      .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
      .setAudioFormat(AudioFormat.Builder().setEncoding(AudioFormat.ENCODING_PCM_16BIT).setSampleRate(pcm.sampleRate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO).build())
      .setTransferMode(AudioTrack.MODE_STATIC)
      .setBufferSizeInBytes(maxOf(pcm.samples.size * 2, 4096))
      .build()
    try {
      t.write(pcm.samples, 0, pcm.samples.size)
      t.play()
    } catch (e: Throwable) {
      t.release()
      throw e
    }
    track = t
    return pcm.samples.size.toDouble() / pcm.sampleRate
  }

  @Synchronized
  fun stop() {
    track?.let {
      runCatching { it.stop() }
      it.release()
    }
    track = null
  }
}
