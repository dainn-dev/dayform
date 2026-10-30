package dev.dayform.widget

import android.graphics.Color
import org.json.JSONException
import org.json.JSONObject

internal data class WidgetItem(val title: String?, val start: String, val durationMin: Int, val done: Boolean)

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

/** The user's accent from the Theme page: the strong colour (progress, times, badge text) and its tint (badge and next-row background). */
internal data class WidgetAccent(val primary: Int, val tint: Int)

/** `pet` is a kind id of the Pet settings page ("gray-cat", "dog", "kitsune", "chicken", "paimon", "goku" or "off"); both pet fields are optional so an older app still works. */
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
    return WidgetAccent(primary = Color.parseColor(primary), tint = Color.parseColor(tint))
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
  )
}
