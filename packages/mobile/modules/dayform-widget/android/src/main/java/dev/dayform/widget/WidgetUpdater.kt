package dev.dayform.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.os.Bundle
import android.util.Log
import android.widget.FrameLayout
import android.widget.RemoteViews

private const val TAG = "DayformWidget"

/** Every widget size offered in the picker. */
private val PROVIDERS = listOf(TodayWidgetProvider::class.java, TodayWidgetProviderLarge::class.java)

internal object WidgetUpdater {
  fun updateOne(context: Context, manager: AppWidgetManager, widgetId: Int, options: Bundle?) {
    val views = WidgetRenderer.render(context, options)
    logIfNotApplicable(context, views)
    manager.updateAppWidget(widgetId, views)
  }

  /** Applies the views once here: a launcher that cannot apply them shows a spinner and says nothing, this says why. */
  private fun logIfNotApplicable(context: Context, views: RemoteViews) {
    try {
      views.apply(context, FrameLayout(context))
    } catch (error: RuntimeException) {
      Log.e(TAG, "The widget views cannot be applied", error)
    }
  }

  /** Redraws all placed widgets and keeps the midnight alarm armed only while at least one exists. */
  fun updateAll(context: Context) {
    val appContext = context.applicationContext
    val manager = AppWidgetManager.getInstance(appContext)
    val ids = PROVIDERS.flatMap { manager.getAppWidgetIds(ComponentName(appContext, it)).asList() }
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
