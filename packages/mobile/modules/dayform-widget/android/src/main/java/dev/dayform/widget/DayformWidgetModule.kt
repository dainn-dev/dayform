package dev.dayform.widget

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val MAX_JSON_CHARS = 100_000

class DayformWidgetModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DayformWidget")

    AsyncFunction("setSnapshot") { json: String ->
      storeSnapshot(json)
    }

    // The widget's custom background picture: the file and its veil live natively, the app only asks for changes.
    AsyncFunction("setBackground") { uri: String ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val saved = WidgetBackground.save(context, uri)
      if (saved) WidgetUpdater.updateAll(context)
      saved
    }

    AsyncFunction("clearBackground") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      WidgetBackground.clear(context)
      WidgetUpdater.updateAll(context)
      true
    }

    AsyncFunction("setBackgroundVeil") { percent: Int ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      WidgetStore.saveVeil(context, percent.coerceIn(0, WidgetBackground.MAX_VEIL))
      WidgetUpdater.updateAll(context)
      true
    }

    // [1 when a picture is set else 0, the veil in percent]
    Function("getBackground") {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      listOf(if (WidgetBackground.exists(context)) 1 else 0, WidgetStore.loadVeil(context))
    }
  }

  private fun storeSnapshot(json: String): Boolean {
    if (json.length > MAX_JSON_CHARS) {
      throw CodedException("ERR_SNAPSHOT_TOO_LARGE", "Widget snapshot has ${json.length} characters", null)
    }
    if (WidgetSnapshotParser.parse(json) == null) {
      throw CodedException("ERR_INVALID_SNAPSHOT", "Widget snapshot is not valid", null)
    }
    val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
    WidgetStore.save(context, json)
    WidgetUpdater.updateAll(context)
    return true
  }
}
