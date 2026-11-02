package dev.dayform.widget

import android.content.Intent

/**
 * Text another app shares to Dayform (the system share sheet, "Dayform"): the app opens quick add with it. The text
 * is read from the share intent once and then removed from it, so turning the phone or coming back from the recent
 * apps never adds it again. It is kept only in memory.
 */
internal object SharedText {
  /** A shared page or note can be long; a task title is not. */
  private const val MAX_CHARS = 600

  @Volatile
  private var pending: String? = null

  fun capture(intent: Intent?) {
    if (intent == null || intent.action != Intent.ACTION_SEND || intent.type?.startsWith("text/") != true) return
    val text = intent.getStringExtra(Intent.EXTRA_TEXT)?.trim().orEmpty()
    intent.action = Intent.ACTION_MAIN
    intent.removeExtra(Intent.EXTRA_TEXT)
    if (text.isNotEmpty()) pending = text.take(MAX_CHARS)
  }

  /** The shared text, once; null when there is none. */
  fun take(): String? {
    val text = pending
    pending = null
    return text
  }
}
