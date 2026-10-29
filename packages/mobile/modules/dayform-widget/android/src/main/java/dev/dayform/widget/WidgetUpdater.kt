package dev.dayform.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Bundle

internal object WidgetUpdater {
  fun updateOne(context: Context, manager: AppWidgetManager, widgetId: Int, options: Bundle?) {
    manager.updateAppWidget(widgetId, WidgetRenderer.render(context, options))
  }

  /** Redraws all placed widgets and keeps the midnight alarm armed only while at least one exists. */
  fun updateAll(context: Context) {
    val appContext = context.applicationContext
    val manager = AppWidgetManager.getInstance(appContext)
    val ids = manager.getAppWidgetIds(ComponentName(appContext, TodayWidgetProvider::class.java))
    if (ids.isEmpty()) {
      MidnightAlarm.cancel(appContext)
      return
    }
    for (id in ids) {
      updateOne(appContext, manager, id, manager.getAppWidgetOptions(id))
    }
    MidnightAlarm.schedule(appContext)
  }
}
