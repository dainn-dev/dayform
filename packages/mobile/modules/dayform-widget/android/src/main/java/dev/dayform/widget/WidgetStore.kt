package dev.dayform.widget

import android.content.Context

/** The last snapshot sent by the app, kept in a private preferences file. */
internal object WidgetStore {
  private const val FILE_NAME = "dayform_widget"
  private const val KEY_SNAPSHOT = "snapshot"

  fun save(context: Context, json: String) {
    context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_SNAPSHOT, json)
      .apply()
  }

  fun load(context: Context): String? =
    context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE).getString(KEY_SNAPSHOT, null)
}
