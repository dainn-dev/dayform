package dev.dayform.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Redraws every widget on the midnight alarm, after boot and when the date, time or time zone changes. */
class WidgetRefreshReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    WidgetUpdater.updateAll(context)
  }

  companion object {
    const val ACTION_MIDNIGHT = "dev.dayform.widget.action.MIDNIGHT"
  }
}
