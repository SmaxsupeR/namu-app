package app.namu.tts

import android.media.MediaCodec
import android.media.MediaCodecInfo
import android.media.MediaFormat
import android.media.MediaMuxer
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Encodes mono speech to AAC-LC in an .m4a file with the platform encoder, about 12 times
 * smaller than WAV. Written through a temporary file and a rename. Throws on any failure,
 * so the caller can keep WAV instead.
 */
object AacEncoder {
  const val BITRATE = 64_000
  private const val MIME = MediaFormat.MIMETYPE_AUDIO_AAC
  private const val TIMEOUT_US = 10_000L

  fun encode(audio: FloatArray, sampleRate: Int, dest: File) {
    dest.parentFile?.mkdirs()
    val tmp = File(dest.parentFile, "${dest.name}.part")
    val pcm = ByteBuffer.allocate(audio.size * 2).order(ByteOrder.LITTLE_ENDIAN)
    for (x in audio) pcm.putShort((x.coerceIn(-1f, 1f) * 32767).toInt().toShort())
    val bytes = pcm.array()

    val format = MediaFormat.createAudioFormat(MIME, sampleRate, 1).apply {
      setInteger(MediaFormat.KEY_AAC_PROFILE, MediaCodecInfo.CodecProfileLevel.AACObjectLC)
      setInteger(MediaFormat.KEY_BIT_RATE, BITRATE)
      setInteger(MediaFormat.KEY_MAX_INPUT_SIZE, 16_384)
    }
    val codec = MediaCodec.createEncoderByType(MIME)
    var muxer: MediaMuxer? = null
    var muxerStarted = false
    try {
      codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      codec.start()
      muxer = MediaMuxer(tmp.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      var track = -1
      var offset = 0
      var inputDone = false
      val info = MediaCodec.BufferInfo()
      var guard = 0
      while (true) {
        if (++guard > 1_000_000) throw IllegalStateException("AAC encoder did not finish")
        if (!inputDone) {
          val inIndex = codec.dequeueInputBuffer(TIMEOUT_US)
          if (inIndex >= 0) {
            val buf = codec.getInputBuffer(inIndex)!!
            buf.clear()
            val n = minOf(buf.remaining(), bytes.size - offset)
            buf.put(bytes, offset, n)
            val timeUs = offset / 2 * 1_000_000L / sampleRate
            offset += n
            if (offset >= bytes.size) {
              codec.queueInputBuffer(inIndex, 0, n, timeUs, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
              inputDone = true
            } else {
              codec.queueInputBuffer(inIndex, 0, n, timeUs, 0)
            }
          }
        }
        val outIndex = codec.dequeueOutputBuffer(info, TIMEOUT_US)
        when {
          outIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            track = muxer.addTrack(codec.outputFormat)
            muxer.start()
            muxerStarted = true
          }
          outIndex >= 0 -> {
            val out = codec.getOutputBuffer(outIndex)!!
            if (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG != 0) info.size = 0
            if (info.size > 0 && muxerStarted) {
              out.position(info.offset)
              out.limit(info.offset + info.size)
              muxer.writeSampleData(track, out, info)
            }
            codec.releaseOutputBuffer(outIndex, false)
            if (info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM != 0) break
          }
        }
      }
      if (!muxerStarted) throw IllegalStateException("AAC encoder produced no output")
    } finally {
      runCatching { codec.stop() }
      codec.release()
      runCatching { if (muxerStarted) muxer?.stop() }
      runCatching { muxer?.release() }
    }
    if (tmp.length() < 64) {
      tmp.delete()
      throw IllegalStateException("AAC file is empty")
    }
    if (!tmp.renameTo(dest)) {
      tmp.delete()
      throw java.io.IOException("Could not move audio into place")
    }
  }
}
