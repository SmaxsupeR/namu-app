package app.namu.tts

/**
 * Brings synthesized speech to a steady level: the model's output peaks around −9 dBFS,
 * much quieter than the phone's own voice, so users turned the volume up and heard the
 * speaker's hiss. Peaks go to −1 dBFS (gain capped at ×4), with 5 ms fades against clicks.
 */
object Loudness {
  const val TARGET_PEAK = 0.89f
  const val MAX_GAIN = 4f

  fun normalize(audio: FloatArray, sampleRate: Int): FloatArray {
    var peak = 0f
    for (x in audio) if (kotlin.math.abs(x) > peak) peak = kotlin.math.abs(x)
    val gain = if (peak > 1e-6f) minOf(TARGET_PEAK / peak, MAX_GAIN) else 1f
    val out = FloatArray(audio.size) { audio[it] * gain }
    val fade = minOf(sampleRate / 200, out.size / 2)
    for (i in 0 until fade) {
      val k = i.toFloat() / fade
      out[i] *= k
      out[out.size - 1 - i] *= k
    }
    return out
  }
}
