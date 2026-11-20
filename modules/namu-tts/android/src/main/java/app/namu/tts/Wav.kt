package app.namu.tts

import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** 16-bit mono PCM WAV files: the format of synthesized and cached audio. */
object Wav {
  class Pcm(val samples: ShortArray, val sampleRate: Int)

  /** Writes to a temporary file first and renames it, so a crash never leaves a half-written file. */
  fun write(dest: File, audio: FloatArray, rate: Int) {
    dest.parentFile?.mkdirs()
    val tmp = File(dest.parentFile, "${dest.name}.part")
    val data = ByteBuffer.allocate(audio.size * 2).order(ByteOrder.LITTLE_ENDIAN)
    for (x in audio) data.putShort((x.coerceIn(-1f, 1f) * 32767).toInt().toShort())
    RandomAccessFile(tmp, "rw").use { raf ->
      raf.setLength(0)
      val h = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
      h.put("RIFF".toByteArray()).putInt(36 + audio.size * 2).put("WAVE".toByteArray()).put("fmt ".toByteArray())
        .putInt(16).putShort(1).putShort(1).putInt(rate).putInt(rate * 2).putShort(2).putShort(16)
        .put("data".toByteArray()).putInt(audio.size * 2)
      raf.write(h.array())
      raf.write(data.array())
      raf.fd.sync()
    }
    if (!tmp.renameTo(dest)) {
      tmp.delete()
      throw java.io.IOException("Could not move audio into place")
    }
  }

  /** Reads a WAV written by [write] (or any 16-bit mono PCM WAV). */
  fun read(file: File): Pcm {
    val bytes = file.readBytes()
    val b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    if (bytes.size < 44 || String(bytes, 0, 4) != "RIFF" || String(bytes, 8, 4) != "WAVE") throw java.io.IOException("Not a WAV file")
    var pos = 12
    var rate = 0
    var bits = 0
    var channels = 0
    while (pos + 8 <= bytes.size) {
      val id = String(bytes, pos, 4)
      val size = b.getInt(pos + 4)
      val body = pos + 8
      if (size < 0 || body + size > bytes.size) throw java.io.IOException("Damaged WAV file")
      if (id == "fmt ") {
        channels = b.getShort(body + 2).toInt()
        rate = b.getInt(body + 4)
        bits = b.getShort(body + 14).toInt()
      } else if (id == "data") {
        if (bits != 16 || channels != 1 || rate <= 0) throw java.io.IOException("Unsupported WAV format")
        val out = ShortArray(size / 2)
        b.position(body)
        b.asShortBuffer().get(out)
        return Pcm(out, rate)
      }
      pos = body + size + (size and 1)
    }
    throw java.io.IOException("WAV file has no audio")
  }
}
