package dev.dayform.widget

import org.json.JSONException
import org.json.JSONObject

internal data class WidgetItem(val title: String?, val start: String, val durationMin: Int, val done: Boolean)

internal data class WidgetDay(val total: Int, val done: Int, val items: List<WidgetItem>)

internal data class WidgetLabels(
  val empty: String,
  val more: String,
  val today: String,
  val tasks: String,
  val task: String,
)

internal data class WidgetSnapshot(val locale: String, val labels: WidgetLabels, val days: Map<String, WidgetDay>)

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
      ),
      days = days,
    )
  }

  private fun readDay(day: JSONObject): WidgetDay {
    val itemsJson = day.getJSONArray("items")
    val items = ArrayList<WidgetItem>(itemsJson.length())
    for (index in 0 until itemsJson.length()) {
      items.add(readItem(itemsJson.getJSONObject(index)))
    }
    return WidgetDay(total = day.getInt("n"), done = day.optInt("done", 0), items = items)
  }

  private fun readItem(item: JSONObject): WidgetItem = WidgetItem(
    title = if (item.isNull("t")) null else item.getString("t"),
    start = item.getString("s"),
    durationMin = item.optInt("d", 0),
    done = item.optInt("x", 0) == 1,
  )
}
