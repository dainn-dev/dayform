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
