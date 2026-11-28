package com.habitline.ui

import android.content.Context
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.view.View
import com.habitline.R
import com.habitline.data.AnalyticsDay

internal class ProgressChart(context: Context, rows: List<AnalyticsDay>, points: Boolean) : View(context) {
    private val values = rows.map { if (points) it.points else it.rate }
    private val focus = if (points) emptyList() else rows.map { it.focus }
    private val scale = if (points) rows.maxOfOrNull { it.points }?.coerceAtLeast(1.0) ?: 1.0 else 100.0
    private val bars = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = context.getColor(R.color.app_primary) }
    private val grid = Paint().apply { color = context.getColor(R.color.app_outline) }
    private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = context.getColor(R.color.app_muted)
        strokeWidth = dp(2).toFloat()
        pathEffect = DashPathEffect(floatArrayOf(dp(3).toFloat(), dp(3).toFloat()), 0f)
    }

    init { importantForAccessibility = IMPORTANT_FOR_ACCESSIBILITY_NO }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        if (values.isEmpty()) return
        val top = dp(8).toFloat()
        val floor = height - top
        val band = width.toFloat() / values.size
        val inset = band / 6
        val span = floor - top
        for (step in 0..4) {
            val y = top + span * step / 4
            canvas.drawLine(0f, y, width.toFloat(), y, grid)
        }
        for (index in values.indices) {
            val value = values[index] ?: continue
            val x = index * band
            val y = floor - (span * value / scale).toFloat()
            canvas.drawRect(x + inset, y, x + band - inset, floor, bars)
        }
        var previous: Int? = null
        for (index in focus.indices) {
            val value = focus[index]
            val y = value?.let { floor - span * it / 100 }
            val prior = previous
            if (y != null) {
                val center = band * (index + 0.5f)
                if (prior == null) canvas.drawPoint(center, y, line)
                else canvas.drawLine(center - band, floor - span * prior / 100, center, y, line)
            }
            previous = value
        }
    }
}
