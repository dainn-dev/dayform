package dev.dayform.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

/** One inexact alarm per day at 00:01 local time so the widget rolls over without the app running. */
internal object MidnightAlarm {
  private const val REQUEST_CODE = 7101

  private fun pendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, WidgetRefreshReceiver::class.java)
    intent.action = WidgetRefreshReceiver.ACTION_MIDNIGHT
    return PendingIntent.getBroadcast(
      context,
      REQUEST_CODE,
      intent,
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  private fun alarmManager(context: Context): AlarmManager =
    context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

  fun schedule(context: Context) {
    val triggerAt = WidgetClock.nextRefreshMs(System.currentTimeMillis())
    alarmManager(context).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent(context))
  }

  fun cancel(context: Context) {
    alarmManager(context).cancel(pendingIntent(context))
  }
}
