package dev.dayform.widget

import android.text.format.DateFormat
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/** Local-time helpers; the app's dates are local wall-clock `YYYY-MM-DD` strings, never UTC. */
internal object WidgetClock {
  private const val REFRESH_MINUTE_OF_DAY = 1
  private const val DATE_SKELETON = "EEEMMMd"

  fun todayKey(nowMs: Long): String {
    val calendar = Calendar.getInstance()
    calendar.timeInMillis = nowMs
    return String.format(
      Locale.ROOT,
      "%04d-%02d-%02d",
      calendar.get(Calendar.YEAR),
      calendar.get(Calendar.MONTH) + 1,
      calendar.get(Calendar.DAY_OF_MONTH),
    )
  }

  /** The next local 00:01 strictly after `nowMs`. */
  fun nextRefreshMs(nowMs: Long): Long {
    val calendar = Calendar.getInstance()
    calendar.timeInMillis = nowMs
    calendar.set(Calendar.HOUR_OF_DAY, 0)
    calendar.set(Calendar.MINUTE, REFRESH_MINUTE_OF_DAY)
    calendar.set(Calendar.SECOND, 0)
    calendar.set(Calendar.MILLISECOND, 0)
    if (calendar.timeInMillis <= nowMs) calendar.add(Calendar.DAY_OF_MONTH, 1)
    return calendar.timeInMillis
  }

  /** Short weekday + month + day in the app's language, e.g. "Thu, Oct 29". */
  fun headerDate(nowMs: Long, languageTag: String): String {
    val locale = Locale.forLanguageTag(languageTag)
    val pattern = DateFormat.getBestDateTimePattern(locale, DATE_SKELETON)
    return SimpleDateFormat(pattern, locale).format(Date(nowMs))
  }
}
