package app.namu.tts

import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.FloatBuffer
import kotlin.math.ceil
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min

/**
 * Handwritten Korean → text with a PP-OCRv5 recognition model (CTC). Strokes are drawn as a
 * thin line into a 48 px high image, exactly like labs/handwriting/eval.py, so results on the
 * phone match the lab. Everything runs on the device.
 */
class InkRecognizer(dir: File) {
  private val env = OrtEnvironment.getEnvironment()
  private val session: OrtSession
  private val input: String
  private val chars: List<String>
  private val index: Map<String, Int>

  init {
    val opts = OrtSession.SessionOptions().apply {
      setIntraOpNumThreads(2)
      setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT)
    }
    session = env.createSession(File(dir, "rec.onnx").absolutePath, opts)
    input = session.inputNames.first()
    val dict = File(dir, "dict.txt").readLines(Charsets.UTF_8).map { it.trimEnd('\n', '\r') }
    chars = listOf("") + dict + listOf(" ")
    index = HashMap<String, Int>().also { m -> chars.forEachIndexed { i, c -> if (i > 0 && c.isNotEmpty()) m.putIfAbsent(c, i) } }
  }

  fun close() = session.close()

  class Result(val text: String, val score: Double?, val ms: Long, val image: String?)

  /** strokes: each stroke is x0, y0, x1, y1, … in any units. score: CTC loss of `expected` per character. */
  @Synchronized
  fun recognize(strokes: List<List<Double>>, expected: String?, withImage: Boolean): Result {
    val t0 = System.nanoTime()
    val img = render(strokes) ?: return Result("", null, 0, null)
    val w = min(1600, max(16, ceil(img.width * H.toDouble() / img.height).toInt()))
    val scaled = Bitmap.createScaledBitmap(img, w, H, true)
    val px = IntArray(w * H)
    scaled.getPixels(px, 0, w, 0, 0, w, H)
    val data = FloatArray(3 * H * w)
    for (i in px.indices) {
      val v = (Color.red(px[i]) / 255f - 0.5f) / 0.5f
      data[i] = v
      data[H * w + i] = v
      data[2 * H * w + i] = v
    }
    val lp: Array<FloatArray>
    OnnxTensor.createTensor(env, FloatBuffer.wrap(data), longArrayOf(1, 3, H.toLong(), w.toLong())).use { t ->
      session.run(mapOf(input to t)).use { out ->
        @Suppress("UNCHECKED_CAST")
        val probs = (out[0].value as Array<Array<FloatArray>>)[0]
        lp = Array(probs.size) { r -> FloatArray(probs[r].size) { c -> ln(max(probs[r][c], 1e-12f)) } }
      }
    }
    val text = greedy(lp)
    val score = expected?.let { e -> nll(lp, e)?.let { it / max(1, e.codePointCount(0, e.length)) } }
    val image = if (withImage) png(scaled) else null
    return Result(text, score, (System.nanoTime() - t0) / 1_000_000, image)
  }

  private fun render(strokes: List<List<Double>>): Bitmap? {
    var x0 = Double.MAX_VALUE; var y0 = Double.MAX_VALUE; var x1 = -Double.MAX_VALUE; var y1 = -Double.MAX_VALUE
    var points = 0
    for (s in strokes) {
      var i = 0
      while (i + 1 < s.size) {
        x0 = min(x0, s[i]); x1 = max(x1, s[i]); y0 = min(y0, s[i + 1]); y1 = max(y1, s[i + 1])
        i += 2; points++
      }
    }
    if (points == 0) return null
    // A flat word (ㅡ, 一) still gets a sensible size: never taller than wide by more than this.
    val inkH = max(y1 - y0, (x1 - x0) * 0.25).coerceAtLeast(1e-3)
    val scale = INK / inkH
    val w = max(8, ((x1 - x0) * scale).toInt() + 2 * PAD + 1)
    val h = INK.toInt() + 2 * PAD + 1
    val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
    val c = Canvas(bmp)
    c.drawColor(Color.WHITE)
    val paint = Paint().apply {
      color = Color.BLACK; style = Paint.Style.STROKE; strokeWidth = LINE
      strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND; isAntiAlias = true
    }
    val dot = Paint().apply { color = Color.BLACK; style = Paint.Style.FILL; isAntiAlias = true }
    val yOff = PAD + (INK - (y1 - y0) * scale) / 2
    for (s in strokes) {
      if (s.size < 2) continue
      val p = Path()
      p.moveTo(((s[0] - x0) * scale + PAD).toFloat(), ((s[1] - y0) * scale + yOff).toFloat())
      if (s.size == 2) {
        c.drawCircle(((s[0] - x0) * scale + PAD).toFloat(), ((s[1] - y0) * scale + yOff).toFloat(), LINE / 2, dot)
        continue
      }
      var i = 2
      while (i + 1 < s.size) {
        p.lineTo(((s[i] - x0) * scale + PAD).toFloat(), ((s[i + 1] - y0) * scale + yOff).toFloat())
        i += 2
      }
      c.drawPath(p, paint)
    }
    return bmp
  }

  private fun greedy(lp: Array<FloatArray>): String {
    val sb = StringBuilder()
    var prev = 0
    for (row in lp) {
      var k = 0
      for (j in row.indices) if (row[j] > row[k]) k = j
      if (k != prev && k != 0) sb.append(chars[k])
      prev = k
    }
    return sb.toString().trim()
  }

  /** CTC negative log-likelihood of `text`; null if a character is not in the model's alphabet. */
  private fun nll(lp: Array<FloatArray>, text: String): Double? {
    val labels = ArrayList<Int>()
    var i = 0
    while (i < text.length) {
      val cp = text.codePointAt(i)
      labels += index[String(Character.toChars(cp))] ?: return null
      i += Character.charCount(cp)
    }
    val ext = IntArray(labels.size * 2 + 1)
    labels.forEachIndexed { k, l -> ext[2 * k + 1] = l }
    val s = ext.size
    val t = lp.size
    if (t < labels.size) return 1e9
    var a = DoubleArray(s) { Double.NEGATIVE_INFINITY }
    a[0] = lp[0][ext[0]].toDouble()
    if (s > 1) a[1] = lp[0][ext[1]].toDouble()
    for (step in 1 until t) {
      val prev = a
      a = DoubleArray(s) { Double.NEGATIVE_INFINITY }
      for (j in 0 until s) {
        var v = prev[j]
        if (j >= 1) v = logAdd(v, prev[j - 1])
        if (j >= 2 && ext[j] != 0 && ext[j] != ext[j - 2]) v = logAdd(v, prev[j - 2])
        a[j] = v + lp[step][ext[j]]
      }
    }
    val total = if (s > 1) logAdd(a[s - 1], a[s - 2]) else a[s - 1]
    return -total
  }

  private fun logAdd(x: Double, y: Double): Double {
    if (x == Double.NEGATIVE_INFINITY) return y
    if (y == Double.NEGATIVE_INFINITY) return x
    val m = max(x, y)
    return m + ln(Math.exp(x - m) + Math.exp(y - m))
  }

  private fun png(b: Bitmap): String {
    val out = ByteArrayOutputStream()
    b.compress(Bitmap.CompressFormat.PNG, 100, out)
    return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
  }

  companion object {
    private const val H = 48
    private const val INK = 40.0
    private const val PAD = 4
    private const val LINE = 3f
  }
}
