package dev.dayform.widget

import android.content.Context

/** The last snapshot sent by the app, kept in a private preferences file. */
internal object WidgetStore {
  private const val FILE_NAME = "dayform_widget"
  private const val KEY_SNAPSHOT = "snapshot"
  private const val KEY_VEIL = "background_veil"

  fun save(context: Context, json: String) {
    context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_SNAPSHOT, json)
      .apply()
  }

  /** How much white veil covers the custom background picture, in percent (WidgetBackground). */
  fun saveVeil(context: Context, percent: Int) {
    context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE).edit().putInt(KEY_VEIL, percent).apply()
  }

  fun loadVeil(context: Context): Int =
    context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE).getInt(KEY_VEIL, WidgetBackground.DEFAULT_VEIL)

  fun load(context: Context): String? =
    context.getSharedPreferences(FILE_NAME, Context.MODE_PRIVATE).getString(KEY_SNAPSHOT, null)
}
