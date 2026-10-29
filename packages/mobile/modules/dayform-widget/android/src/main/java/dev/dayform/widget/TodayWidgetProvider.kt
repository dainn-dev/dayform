package dev.dayform.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.os.Bundle

class TodayWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    for (id in appWidgetIds) {
      WidgetUpdater.updateOne(context, appWidgetManager, id, appWidgetManager.getAppWidgetOptions(id))
    }
    MidnightAlarm.schedule(context)
  }

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle,
  ) {
    WidgetUpdater.updateOne(context, appWidgetManager, appWidgetId, newOptions)
    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
  }

  override fun onEnabled(context: Context) {
    MidnightAlarm.schedule(context)
  }

  override fun onDisabled(context: Context) {
    MidnightAlarm.cancel(context)
  }
}
