package dev.dayform.widget

import android.graphics.Color
import org.json.JSONException
import org.json.JSONObject

/** `id` is the app's task id, sent only for today's items: tapping the row ticks it (see [WidgetToggle]). */
internal data class WidgetItem(val title: String?, val start: String, val durationMin: Int, val done: Boolean, val id: String? = null)

/** `marks` are the lines under the header (holidays and special days); `special` is true when one is the user's own. */
internal data class WidgetDay(val total: Int, val done: Int, val items: List<WidgetItem>, val marks: List<String>, val special: Boolean)

internal data class WidgetLabels(
  val empty: String,
  val more: String,
  val today: String,
  val tasks: String,
  val task: String,
  val special: String,
)

/**
 * The light card colours of the app's style (any style but the original): the surface, the main text, the muted text
 * and the outline. The finished-task grey and bar are mixed from them, so all four are needed.
 */
internal data class WidgetCard(val background: Int, val foreground: Int, val muted: Int, val line: Int) {
  /** Text of a finished task: the muted text faded towards the surface. */
  val done: Int get() = blend(muted, background, DONE_FADE)
  /** Bar of a finished task: the outline darkened towards the muted text. */
  val doneBar: Int get() = blend(line, muted, DONE_BAR_DEPTH)

  private companion object {
    const val DONE_FADE = 0.35f
    const val DONE_BAR_DEPTH = 0.2f

    fun blend(from: Int, to: Int, amount: Float): Int {
      fun channel(a: Int, b: Int) = Math.round(a + (b - a) * amount)
      return Color.rgb(
        channel(Color.red(from), Color.red(to)),
        channel(Color.green(from), Color.green(to)),
        channel(Color.blue(from), Color.blue(to)),
      )
    }
  }
}

/**
 * The user's accent from the Theme page: the strong colour (progress, times, badge text) and its tint (badge and
 * next-row background). `card` is null for the original style or an older app: the card then keeps its resource colours.
 */
internal data class WidgetAccent(val primary: Int, val tint: Int, val card: WidgetCard? = null)

/** `pet` is a kind id of the Pet settings page ("gray-cat", "dog", "kitsune", "chicken", "goku" or "off"); both pet fields are optional so an older app still works. */
internal data class WidgetSnapshot(
  val locale: String,
  val labels: WidgetLabels,
  val days: Map<String, WidgetDay>,
  val pet: String,
  val petWalks: Boolean,
  /** Null when the app sent no (valid) accent, e.g. an older app: the widget then keeps the colours of its resources. */
  val accent: WidgetAccent?,
)

/** Reads the JSON written by lib/widget-snapshot.ts. Anything unexpected yields null, never a crash. */
internal object WidgetSnapshotParser {
  private const val SUPPORTED_VERSION = 1

  fun parse(json: String?): WidgetSnapshot? {
    if (json.isNullOrEmpty()) return null
    return try {
      read(JSONObject(json))
    } catch (error: JSONException) {
      null
    }
  }

  private fun read(root: JSONObject): WidgetSnapshot? {
    if (root.optInt("version", 0) != SUPPORTED_VERSION) return null
    val labels = root.getJSONObject("labels")
    val daysJson = root.getJSONObject("days")
    val days = HashMap<String, WidgetDay>()
    val keys = daysJson.keys()
    while (keys.hasNext()) {
      val key = keys.next()
      days[key] = readDay(daysJson.getJSONObject(key))
    }
    return WidgetSnapshot(
      locale = root.optString("locale", "en"),
      labels = WidgetLabels(
        empty = labels.getString("empty"),
        more = labels.getString("more"),
        today = labels.getString("today"),
        tasks = labels.getString("tasks"),
        task = labels.optString("task", labels.getString("tasks")),
        special = labels.optString("special", "Special day"),
      ),
      days = days,
      pet = root.optString("pet", WidgetPet.DEFAULT_KIND),
      petWalks = root.optBoolean("petWalks", true),
      accent = readAccent(root),
    )
  }

  private val HEX_COLOR = Regex("^#[0-9A-Fa-f]{6}$")

  private fun readAccent(root: JSONObject): WidgetAccent? {
    val accent = root.optJSONObject("ac") ?: return null
    val primary = accent.optString("p")
    val tint = accent.optString("t")
    if (!HEX_COLOR.matches(primary) || !HEX_COLOR.matches(tint)) return null
    return WidgetAccent(primary = Color.parseColor(primary), tint = Color.parseColor(tint), card = readCard(accent))
  }

  /** The style's card colours (`bg`, `fg`, `mu`, `ln`): all four valid or none, so a style's text never lands on another card. */
  private fun readCard(accent: JSONObject): WidgetCard? {
    val colors = listOf("bg", "fg", "mu", "ln").map { accent.optString(it) }
    if (colors.any { !HEX_COLOR.matches(it) }) return null
    val (background, foreground, muted, line) = colors.map { Color.parseColor(it) }
    return WidgetCard(background = background, foreground = foreground, muted = muted, line = line)
  }

  private fun readDay(day: JSONObject): WidgetDay {
    val itemsJson = day.getJSONArray("items")
    val items = ArrayList<WidgetItem>(itemsJson.length())
    for (index in 0 until itemsJson.length()) {
      items.add(readItem(itemsJson.getJSONObject(index)))
    }
    val marksJson = day.optJSONArray("m")
    val marks = if (marksJson == null) emptyList() else List(marksJson.length()) { marksJson.optString(it) }.filter { it.isNotEmpty() }
    return WidgetDay(total = day.getInt("n"), done = day.optInt("done", 0), items = items, marks = marks, special = day.optInt("sp", 0) == 1)
  }

  private fun readItem(item: JSONObject): WidgetItem = WidgetItem(
    title = if (item.isNull("t")) null else item.getString("t"),
    start = item.getString("s"),
    durationMin = item.optInt("d", 0),
    done = item.optInt("x", 0) == 1,
    id = item.optString("i", "").ifEmpty { null },
  )
}
