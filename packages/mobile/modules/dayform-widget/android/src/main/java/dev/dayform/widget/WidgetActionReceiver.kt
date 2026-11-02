package dev.dayform.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Handles a tap on a widget row: flips the row at once and queues the tick for the app (see [WidgetToggle]). */
class WidgetActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != WidgetToggle.ACTION) return
    val id = intent.getStringExtra(WidgetToggle.EXTRA_ID) ?: return
    if (WidgetToggle.toggle(context, id, System.currentTimeMillis())) WidgetUpdater.updateAll(context)
  }
}
