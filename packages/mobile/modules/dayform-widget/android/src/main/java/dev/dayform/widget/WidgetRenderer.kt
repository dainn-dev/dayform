package dev.dayform.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.os.Build
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

  /** Measured on the card: the title and progress bar above the rows, one row, and the padding under the last one. */
  private const val PET_HEADER_DP = 47
  private const val PET_ROW_DP = 23
  private const val PET_BOTTOM_PADDING_DP = 10
  /** The pet (44) and the gap under it (8) need this much free height, or it stays away. It walks over the rows when the space under them is smaller. */
  private const val PET_MIN_FREE_DP = 60

  /**
   * Below this much room under the rows the pet roams the whole body of the card, over the rows, instead of a thin strip:
   * a strip is too low for it to walk up and down, which is what its front and back frames are for.
   */
  private const val PET_ROAM_MIN_DP = 100

  /** The marks line (holidays and special days) under the header takes about this much height. */
  private const val MARKS_DP = 18

  /**
   * vivo's launcher reports a widget about 25 dp narrower than it is drawn and counts the app label under it (about
   * 29 dp) in the height; other launchers report the real size, so they get no correction.
   */
  private val isVivo = Build.MANUFACTURER.equals("vivo", ignoreCase = true) || Build.BRAND.equals("iqoo", ignoreCase = true)
  private val launcherWidthFixDp = if (isVivo) 25 else 0
  private val launcherLabelDp = if (isVivo) 29 else 0
  private const val MINUTES_PER_HOUR = 60

  /** What the rows and the "+N more" line show for one day. */
  private data class RowPlan(val shown: Int, val hidden: Int, val showMore: Boolean)

  /** Where a task stands today: finished, the one to do now or next, or still ahead / overdue. */
  private enum class RowState { DONE, NEXT, UPCOMING }

  /**
   * `tints` false skips the tint calls (API 31+ `setColorStateList`), so a launcher that cannot apply them still gets a
   * working widget; the text colours follow the accent either way.
   */
  fun render(context: Context, options: Bundle?, tints: Boolean = true): RemoteViews {
    val snapshot = WidgetSnapshotParser.parse(WidgetStore.load(context))
    val nowMs = System.currentTimeMillis()
    val day = snapshot?.days?.get(WidgetClock.todayKey(nowMs))
    val views = RemoteViews(context.packageName, R.layout.dayform_widget)
    val accent = snapshot?.accent
    bindHeader(context, views, snapshot, day, nowMs)
    bindAccent(views, accent, tints)
    val hasMarks = day?.marks?.isNotEmpty() == true
    val capacity = lineCapacity(options, hasMarks)
    bindRows(context, views, snapshot, day, capacity, nowMs, accent, tints)
    bindPet(context, views, snapshot, day, capacity, options, hasMarks)
    bindBackground(context, views, options)
    bindClick(context, views)
    return views
  }

  private const val DEFAULT_CARD_WIDTH_DP = 280
  private const val DEFAULT_CARD_HEIGHT_DP = 120

  /** Draws the user's own picture behind the card (see WidgetBackground); without one the plain card shows. */
  private fun bindBackground(context: Context, views: RemoteViews, options: Bundle?) {
    val reportedWidth = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) ?: 0
    val reportedHeight = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) ?: 0
    val widthDp = if (reportedWidth > 0) reportedWidth + launcherWidthFixDp else DEFAULT_CARD_WIDTH_DP
    val heightDp = if (reportedHeight > 0) reportedHeight - launcherLabelDp else DEFAULT_CARD_HEIGHT_DP
    val picture = if (WidgetBackground.exists(context)) WidgetBackground.render(context, widthDp, heightDp, WidgetStore.loadVeil(context)) else null
    if (picture == null) {
      views.setViewVisibility(R.id.dayform_widget_photo, View.GONE)
      return
    }
    views.setImageViewBitmap(R.id.dayform_widget_photo, picture)
    views.setViewVisibility(R.id.dayform_widget_photo, View.VISIBLE)
  }

  /**
   * Shows the pet when there is room below the rows, in the mood of the day: it roams the free area while tasks are
   * left, plays when all are done and mostly sleeps when nothing is planned (see WidgetPet).
   */
  private fun bindPet(context: Context, views: RemoteViews, snapshot: WidgetSnapshot?, day: WidgetDay?, capacity: Int, options: Bundle?, hasMarks: Boolean) {
    val total = day?.total ?: 0
    val plan = planRows(total, day?.items?.size ?: 0, capacity)
    val usedLines = plan.shown + if (plan.showMore) 1 else 0
    val reportedWidth = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) ?: 0
    val reportedHeight = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) ?: 0
    val widthDp = if (reportedWidth > 0) reportedWidth + launcherWidthFixDp else 0
    // The card's height minus its header, its bottom padding and the rows shown is the room left for the pet.
    val bodyHeightDp = if (reportedHeight > 0) reportedHeight - launcherLabelDp - PET_HEADER_DP - PET_BOTTOM_PADDING_DP else capacity * LINE_DP
    val roomBelowRowsDp = if (reportedHeight > 0) {
      bodyHeightDp - usedLines * PET_ROW_DP - (if (hasMarks) MARKS_DP else 0)
    } else {
      (capacity - usedLines) * LINE_DP
    }
    // With little room under the rows the pet walks over them (the whole body of the card) instead of staying away.
    val freeHeightDp = if (roomBelowRowsDp >= PET_ROAM_MIN_DP) roomBelowRowsDp else bodyHeightDp
    val mood = when {
      freeHeightDp < PET_MIN_FREE_DP -> null
      day?.special == true -> PetMood.CHEERING
      total <= 0 -> PetMood.RESTING
      (day?.done ?: 0) >= total -> PetMood.CHEERING
      else -> PetMood.WALKING
    }
    WidgetPet.bind(context, views, snapshot?.pet ?: WidgetPet.DEFAULT_KIND, snapshot?.petWalks ?: true, mood, widthDp, freeHeightDp)
  }

  /** Paints the header with the user's accent: the badge, the progress fill and the marks line. */
  private fun bindAccent(views: RemoteViews, accent: WidgetAccent?, tints: Boolean) {
    if (accent == null) return
    views.setTextColor(R.id.dayform_widget_count, accent.primary)
    views.setTextColor(R.id.dayform_widget_marks, accent.primary)
    views.setTextColor(R.id.dayform_widget_more, accent.primary)
    if (!tints) return
    tintBackground(views, R.id.dayform_widget_count, accent.tint)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      views.setColorStateList(R.id.dayform_widget_progress, "setProgressTintList", ColorStateList.valueOf(accent.primary))
    }
  }

  /** Tints the background drawable of a view (API 31+); an older launcher keeps the colour of the resource. */
  private fun tintBackground(views: RemoteViews, id: Int, color: Int) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) views.setColorStateList(id, "setBackgroundTintList", ColorStateList.valueOf(color))
  }

  /** The names of the day's holidays and special days, on one line under the header (hidden when there are none). */
  private fun bindMarks(views: RemoteViews, day: WidgetDay?) {
    val marks = day?.marks.orEmpty()
    if (marks.isEmpty()) {
      views.setViewVisibility(R.id.dayform_widget_marks, View.GONE)
      return
    }
    views.setTextViewText(R.id.dayform_widget_marks, marks.joinToString(" · "))
    views.setViewVisibility(R.id.dayform_widget_marks, View.VISIBLE)
  }

  private fun bindHeader(context: Context, views: RemoteViews, snapshot: WidgetSnapshot?, day: WidgetDay?, nowMs: Long) {
    val languageTag = snapshot?.locale ?: Locale.getDefault().toLanguageTag()
    views.setTextViewText(R.id.dayform_widget_title, snapshot?.labels?.today ?: context.getString(R.string.dayform_widget_today))
    views.setTextViewText(R.id.dayform_widget_date, WidgetClock.headerDate(nowMs, languageTag))
    if (WidgetBackground.exists(context)) views.setTextColor(R.id.dayform_widget_date, context.getColor(R.color.dayform_widget_text_secondary_photo))

    bindMarks(views, day)

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

  private fun bindRows(context: Context, views: RemoteViews, snapshot: WidgetSnapshot?, day: WidgetDay?, capacity: Int, nowMs: Long, accent: WidgetAccent?, tints: Boolean) {
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
        bindRow(context, views, ROWS[index], items[index], state, accent, tints)
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
      if (WidgetBackground.exists(context)) views.setTextColor(R.id.dayform_widget_empty, context.getColor(R.color.dayform_widget_text_secondary_photo))
      views.setViewVisibility(R.id.dayform_widget_empty, View.VISIBLE)
    } else {
      views.setViewVisibility(R.id.dayform_widget_empty, View.GONE)
    }
  }

  private fun bindRow(context: Context, views: RemoteViews, ids: RowIds, item: WidgetItem, state: RowState, userAccent: WidgetAccent?, tints: Boolean) {
    val primary = context.getColor(R.color.dayform_widget_text_primary)
    // Over a picture the grey texts are darkened: they were the ones that washed out.
    val onPicture = WidgetBackground.exists(context)
    val secondary = context.getColor(if (onPicture) R.color.dayform_widget_text_secondary_photo else R.color.dayform_widget_text_secondary)
    val muted = context.getColor(if (onPicture) R.color.dayform_widget_text_done_photo else R.color.dayform_widget_text_done)
    val accent = userAccent?.primary ?: context.getColor(R.color.dayform_widget_accent)

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

    if (state == RowState.NEXT && userAccent != null && tints) {
      tintBackground(views, ids.row, userAccent.tint)
      tintBackground(views, ids.bar, userAccent.primary)
    }

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
  private fun lineCapacity(options: Bundle?, hasMarks: Boolean): Int {
    val minHeightDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0) ?: 0
    if (minHeightDp <= 0) return DEFAULT_CAPACITY
    return ((minHeightDp - HEADER_DP - (if (hasMarks) MARKS_DP else 0)) / LINE_DP).coerceIn(1, ROWS.size + 1)
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
