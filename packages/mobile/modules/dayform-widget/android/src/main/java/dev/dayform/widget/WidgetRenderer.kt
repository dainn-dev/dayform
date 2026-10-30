package dev.dayform.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.text.SpannableString
import android.text.Spanned
import android.text.style.StrikethroughSpan
import android.view.View
import android.widget.RemoteViews
import java.util.Calendar
import java.util.Locale

/** Builds the RemoteViews for one widget instance from the stored snapshot and the device's current date. */
internal object WidgetRenderer {
  /** The views of one timeline row. */
  private data class RowIds(val row: Int, val bar: Int, val time: Int, val title: Int, val duration: Int)

  private val ROWS = listOf(
    RowIds(R.id.dayform_widget_row_0, R.id.dayform_widget_bar_0, R.id.dayform_widget_time_0, R.id.dayform_widget_title_0, R.id.dayform_widget_duration_0),
    RowIds(R.id.dayform_widget_row_1, R.id.dayform_widget_bar_1, R.id.dayform_widget_time_1, R.id.dayform_widget_title_1, R.id.dayform_widget_duration_1),
    RowIds(R.id.dayform_widget_row_2, R.id.dayform_widget_bar_2, R.id.dayform_widget_time_2, R.id.dayform_widget_title_2, R.id.dayform_widget_duration_2),
    RowIds(R.id.dayform_widget_row_3, R.id.dayform_widget_bar_3, R.id.dayform_widget_time_3, R.id.dayform_widget_title_3, R.id.dayform_widget_duration_3),
    RowIds(R.id.dayform_widget_row_4, R.id.dayform_widget_bar_4, R.id.dayform_widget_time_4, R.id.dayform_widget_title_4, R.id.dayform_widget_duration_4),
  )

  /** Card padding + title line + progress bar; a row (or the "+N more" line) is about [LINE_DP] tall. */
  private const val HEADER_DP = 60
  private const val LINE_DP = 30
  private const val DEFAULT_CAPACITY = 4
  private const val MINUTES_PER_HOUR = 60

  /** What the rows and the "+N more" line show for one day. */
  private data class RowPlan(val shown: Int, val hidden: Int, val showMore: Boolean)

  /** Where a task stands today: finished, the one to do now or next, or still ahead / overdue. */
  private enum class RowState { DONE, NEXT, UPCOMING }

  fun render(context: Context, options: Bundle?): RemoteViews {
    val snapshot = WidgetSnapshotParser.parse(WidgetStore.load(context))
    val nowMs = System.currentTimeMillis()
    val day = snapshot?.days?.get(WidgetClock.todayKey(nowMs))
    val views = RemoteViews(context.packageName, R.layout.dayform_widget)
    bindHeader(context, views, snapshot, day, nowMs)
    bindRows(context, views, snapshot, day, lineCapacity(options), nowMs)
    bindClick(context, views)
    return views
  }

  private fun bindHeader(context: Context, views: RemoteViews, snapshot: WidgetSnapshot?, day: WidgetDay?, nowMs: Long) {
    val languageTag = snapshot?.locale ?: Locale.getDefault().toLanguageTag()
    views.setTextViewText(R.id.dayform_widget_title, snapshot?.labels?.today ?: context.getString(R.string.dayform_widget_today))
    views.setTextViewText(R.id.dayform_widget_date, WidgetClock.headerDate(nowMs, languageTag))

    val total = day?.total ?: 0
    if (snapshot == null || total <= 0) {
      views.setViewVisibility(R.id.dayform_widget_count, View.GONE)
      views.setViewVisibility(R.id.dayform_widget_progress, View.GONE)
      return
    }
    val done = (day?.done ?: 0).coerceIn(0, total)
    views.setTextViewText(R.id.dayform_widget_count, "✓ $done/$total")
    views.setViewVisibility(R.id.dayform_widget_count, View.VISIBLE)
    views.setProgressBar(R.id.dayform_widget_progress, total, done, false)
    views.setViewVisibility(R.id.dayform_widget_progress, View.VISIBLE)
  }

  private fun bindRows(context: Context, views: RemoteViews, snapshot: WidgetSnapshot?, day: WidgetDay?, capacity: Int, nowMs: Long) {
    val items = day?.items.orEmpty()
    val total = day?.total ?: 0
    val plan = planRows(total, items.size, capacity)
    val nextIndex = nextIndex(items.take(plan.shown), nowMs)

    for (index in ROWS.indices) {
      if (index < plan.shown) {
        val state = when {
          items[index].done -> RowState.DONE
          index == nextIndex -> RowState.NEXT
          else -> RowState.UPCOMING
        }
        bindRow(context, views, ROWS[index], items[index], state)
      } else {
        views.setViewVisibility(ROWS[index].row, View.GONE)
      }
    }

    if (plan.showMore && snapshot != null) {
      views.setTextViewText(R.id.dayform_widget_more, "+" + plan.hidden + " " + snapshot.labels.more)
      views.setViewVisibility(R.id.dayform_widget_more, View.VISIBLE)
    } else {
      views.setViewVisibility(R.id.dayform_widget_more, View.GONE)
    }

    if (total <= 0) {
      views.setTextViewText(R.id.dayform_widget_empty, snapshot?.labels?.empty ?: context.getString(R.string.dayform_widget_empty))
      views.setViewVisibility(R.id.dayform_widget_empty, View.VISIBLE)
    } else {
      views.setViewVisibility(R.id.dayform_widget_empty, View.GONE)
    }
  }

  private fun bindRow(context: Context, views: RemoteViews, ids: RowIds, item: WidgetItem, state: RowState) {
    val primary = context.getColor(R.color.dayform_widget_text_primary)
    val secondary = context.getColor(R.color.dayform_widget_text_secondary)
    val muted = context.getColor(R.color.dayform_widget_text_done)
    val accent = context.getColor(R.color.dayform_widget_accent)

    views.setViewVisibility(ids.row, View.VISIBLE)
    views.setInt(ids.row, "setBackgroundResource", if (state == RowState.NEXT) R.drawable.dayform_widget_row_next else R.drawable.dayform_widget_row_plain)
    views.setInt(
      ids.bar,
      "setBackgroundResource",
      when (state) {
        RowState.DONE -> R.drawable.dayform_widget_bar_done
        RowState.NEXT -> R.drawable.dayform_widget_bar_next
        RowState.UPCOMING -> R.drawable.dayform_widget_bar_upcoming
      },
    )

    views.setTextViewText(ids.time, item.start)
    views.setTextColor(ids.time, if (state == RowState.DONE) muted else if (state == RowState.NEXT) accent else primary)

    views.setTextViewText(ids.title, titleText(item))
    views.setTextColor(ids.title, if (state == RowState.DONE) muted else primary)

    views.setTextViewText(ids.duration, if (item.durationMin > 0) formatDuration(item.durationMin) else "")
    views.setTextColor(ids.duration, if (state == RowState.DONE) muted else secondary)
  }

  /** The first unfinished task that has not ended yet; earlier unfinished ones stay plain rows (they are overdue). */
  private fun nextIndex(items: List<WidgetItem>, nowMs: Long): Int {
    val calendar = Calendar.getInstance()
    calendar.timeInMillis = nowMs
    val nowMinute = calendar.get(Calendar.HOUR_OF_DAY) * MINUTES_PER_HOUR + calendar.get(Calendar.MINUTE)
    return items.indexOfFirst { item ->
      val start = startMinute(item.start)
      !item.done && start != null && start + maxOf(item.durationMin, 1) > nowMinute
    }
  }

  private fun startMinute(start: String): Int? {
    val parts = start.split(":")
    val hours = parts.getOrNull(0)?.toIntOrNull() ?: return null
    val minutes = parts.getOrNull(1)?.toIntOrNull() ?: return null
    return hours * MINUTES_PER_HOUR + minutes
  }

  /** `capacity` counts text lines, including the "+N more" line. */
  private fun planRows(total: Int, available: Int, capacity: Int): RowPlan {
    val fitsAll = total <= minOf(capacity, ROWS.size)
    val wanted = if (fitsAll) total else maxOf(minOf(capacity - 1, ROWS.size), 1)
    val shown = minOf(wanted, available, ROWS.size)
    val hidden = total - shown
    return RowPlan(shown = shown, hidden = hidden, showMore = hidden > 0 && capacity >= 2)
  }

  /** Lines that fit, from the smallest height the launcher reports (so rows are never clipped). */
  private fun lineCapacity(options: Bundle?): Int {
    val minHeightDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) ?: 0
    if (minHeightDp <= 0) return DEFAULT_CAPACITY
    return ((minHeightDp - HEADER_DP) / LINE_DP).coerceIn(1, ROWS.size + 1)
  }

  /** The title, struck through when the task is done; empty when the user hides titles on the widget. */
  private fun titleText(item: WidgetItem): CharSequence {
    val title = item.title.orEmpty()
    if (!item.done || title.isEmpty()) return title
    val struck = SpannableString(title)
    struck.setSpan(StrikethroughSpan(), 0, title.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    return struck
  }

  private fun formatDuration(minutes: Int): String {
    val hours = minutes / MINUTES_PER_HOUR
    val rest = minutes % MINUTES_PER_HOUR
    return when {
      hours == 0 -> "${rest}m"
      rest == 0 -> "${hours}h"
      else -> "${hours}h${rest}m"
    }
  }

  private fun bindClick(context: Context, views: RemoteViews) {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED)
    val pending = PendingIntent.getActivity(
      context,
      0,
      launch,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
    views.setOnClickPendingIntent(R.id.dayform_widget_root, pending)
  }
}
