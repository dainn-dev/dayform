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
import java.util.Locale

/** Builds the RemoteViews for one widget instance from the stored snapshot and the device's current date. */
internal object WidgetRenderer {
  private val ROW_IDS = intArrayOf(
    R.id.dayform_widget_row_0,
    R.id.dayform_widget_row_1,
    R.id.dayform_widget_row_2,
    R.id.dayform_widget_row_3,
    R.id.dayform_widget_row_4,
  )
  private const val HEADER_DP = 44
  private const val LINE_DP = 19
  private const val DEFAULT_CAPACITY = 4

  /** What the rows and the "+N more" line show for one day. */
  private data class RowPlan(val shown: Int, val hidden: Int, val showMore: Boolean)

  fun render(context: Context, options: Bundle?): RemoteViews {
    val snapshot = WidgetSnapshotParser.parse(WidgetStore.load(context))
    val nowMs = System.currentTimeMillis()
    val day = snapshot?.days?.get(WidgetClock.todayKey(nowMs))
    val views = RemoteViews(context.packageName, R.layout.dayform_widget)
    bindHeader(context, views, snapshot, day, nowMs)
    bindRows(context, views, snapshot, day, lineCapacity(options))
    bindClick(context, views)
    return views
  }

  private fun bindHeader(context: Context, views: RemoteViews, snapshot: WidgetSnapshot?, day: WidgetDay?, nowMs: Long) {
    val today = snapshot?.labels?.today ?: context.getString(R.string.dayform_widget_today)
    val languageTag = snapshot?.locale ?: Locale.getDefault().toLanguageTag()
    views.setTextViewText(R.id.dayform_widget_title, today + " · " + WidgetClock.headerDate(nowMs, languageTag))

    val total = day?.total ?: 0
    if (snapshot == null || total <= 0) {
      views.setViewVisibility(R.id.dayform_widget_count, View.GONE)
      return
    }
    val noun = if (total == 1) snapshot.labels.task else snapshot.labels.tasks
    views.setTextViewText(R.id.dayform_widget_count, "$total $noun")
    views.setViewVisibility(R.id.dayform_widget_count, View.VISIBLE)
  }

  private fun bindRows(context: Context, views: RemoteViews, snapshot: WidgetSnapshot?, day: WidgetDay?, capacity: Int) {
    val items = day?.items.orEmpty()
    val total = day?.total ?: 0
    val plan = planRows(total, items.size, capacity)

    for (index in ROW_IDS.indices) {
      if (index < plan.shown) {
        views.setViewVisibility(ROW_IDS[index], View.VISIBLE)
        views.setTextViewText(ROW_IDS[index], rowText(items[index]))
      } else {
        views.setViewVisibility(ROW_IDS[index], View.GONE)
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

  /** `capacity` counts text lines, including the "+N more" line. */
  private fun planRows(total: Int, available: Int, capacity: Int): RowPlan {
    val fitsAll = total <= minOf(capacity, ROW_IDS.size)
    val wanted = if (fitsAll) total else maxOf(minOf(capacity - 1, ROW_IDS.size), 1)
    val shown = minOf(wanted, available, ROW_IDS.size)
    val hidden = total - shown
    return RowPlan(shown = shown, hidden = hidden, showMore = hidden > 0 && capacity >= 2)
  }

  /** Lines that fit, from the smallest height the launcher reports (so rows are never clipped). */
  private fun lineCapacity(options: Bundle?): Int {
    val minHeightDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) ?: 0
    if (minHeightDp <= 0) return DEFAULT_CAPACITY
    return ((minHeightDp - HEADER_DP) / LINE_DP).coerceIn(1, ROW_IDS.size + 1)
  }

  private fun rowText(item: WidgetItem): CharSequence {
    val builder = StringBuilder(item.start)
    if (!item.title.isNullOrEmpty()) builder.append("  ").append(item.title)
    if (item.durationMin > 0) builder.append("  · ").append(formatDuration(item.durationMin))
    val text = builder.toString()
    if (!item.done) return text
    val struck = SpannableString(text)
    struck.setSpan(StrikethroughSpan(), 0, text.length, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    return struck
  }

  private fun formatDuration(minutes: Int): String {
    val hours = minutes / 60
    val rest = minutes % 60
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
