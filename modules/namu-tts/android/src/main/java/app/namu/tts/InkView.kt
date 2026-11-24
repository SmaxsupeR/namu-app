package app.namu.tts

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.view.MotionEvent
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/**
 * A canvas for writing with a finger. Keeps the strokes (in view pixels) for recognition and
 * reports how many there are; drawing happens here, so no touch points cross the JS bridge.
 */
@SuppressLint("ViewConstructor")
class InkView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onStrokesChanged by EventDispatcher()
  private val strokes = ArrayList<ArrayList<Float>>()
  private var current: ArrayList<Float>? = null
  private val paint = Paint().apply {
    color = Color.BLACK
    style = Paint.Style.STROKE
    strokeCap = Paint.Cap.ROUND
    strokeJoin = Paint.Join.ROUND
    isAntiAlias = true
    strokeWidth = 5f * resources.displayMetrics.density
  }

  init {
    setWillNotDraw(false)
  }

  fun setInkColor(color: String?) {
    paint.color = runCatching { Color.parseColor(color ?: "#000000") }.getOrDefault(Color.BLACK)
    invalidate()
  }

  @Synchronized
  fun clear() {
    strokes.clear()
    current = null
    changed()
  }

  @Synchronized
  fun undo() {
    if (strokes.isNotEmpty()) strokes.removeAt(strokes.size - 1)
    changed()
  }

  /** Each stroke as x0, y0, x1, y1, … in pixels. */
  @Synchronized
  fun snapshot(): List<List<Double>> = strokes.map { s -> s.map { it.toDouble() } }

  private fun changed() {
    postInvalidate()
    onStrokesChanged(mapOf("count" to strokes.size))
  }

  @SuppressLint("ClickableViewAccessibility")
  override fun onTouchEvent(e: MotionEvent): Boolean {
    when (e.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        // Writing must not scroll the screen.
        parent?.requestDisallowInterceptTouchEvent(true)
        synchronized(this) {
          current = arrayListOf(e.x, e.y).also { strokes.add(it) }
        }
        invalidate()
      }
      MotionEvent.ACTION_MOVE -> {
        synchronized(this) {
          val s = current ?: return true
          for (h in 0 until e.historySize) {
            s.add(e.getHistoricalX(h)); s.add(e.getHistoricalY(h))
          }
          s.add(e.x); s.add(e.y)
        }
        invalidate()
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        synchronized(this) { current = null }
        parent?.requestDisallowInterceptTouchEvent(false)
        changed()
      }
    }
    return true
  }

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    val copy = synchronized(this) { strokes.map { ArrayList(it) } }
    for (s in copy) {
      if (s.size < 2) continue
      if (s.size == 2) {
        canvas.drawPoint(s[0], s[1], paint)
        continue
      }
      val p = Path()
      p.moveTo(s[0], s[1])
      var i = 2
      while (i + 1 < s.size) {
        p.lineTo(s[i], s[i + 1]); i += 2
      }
      canvas.drawPath(p, paint)
    }
  }
}
