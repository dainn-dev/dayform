package dev.dayform.widget

import android.content.Context
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject

/**
 * A tap on a row of the widget ticks (or unticks) that task. The widget flips the row in its own copy of the snapshot
 * at once and queues the wish; the app applies the queue to the real task list the next time it runs and then
 * acknowledges it (lib/widget-actions.ts). The widget never touches the app's task storage.
 */
internal object WidgetToggle {
  const val ACTION = "dev.dayform.widget.action.TOGGLE"
  const val EXTRA_ID = "task_id"

  /** The queue is capped so it can never grow without bound while the app stays closed. */
  private const val MAX_QUEUE = 200
  private val lock = Any()

  /** Flips task `id` among today's rows and queues the wish. False when the row is not in the snapshot (nothing changed). */
  fun toggle(context: Context, id: String, nowMs: Long): Boolean = synchronized(lock) { flip(context, id, nowMs) }

  /** Removes the entries the app has applied; `receiptJson` is a JSON list of their `at` times. */
  fun acknowledge(context: Context, receiptJson: String) {
    synchronized(lock) {
      val applied = HashSet<Long>()
      try {
        val receipt = JSONArray(receiptJson)
        for (index in 0 until receipt.length()) applied.add(receipt.getLong(index))
      } catch (error: JSONException) {
        return
      }
      val kept = JSONArray()
      val queue = readQueue(WidgetStore.loadToggles(context))
      for (index in 0 until queue.length()) {
        val entry = queue.optJSONObject(index) ?: continue
        if (entry.optLong("at", -1L) !in applied) kept.put(entry)
      }
      WidgetStore.saveToggles(context, kept.toString())
    }
  }

  private fun flip(context: Context, id: String, nowMs: Long): Boolean {
    val json = WidgetStore.load(context) ?: return false
    val root = try {
      JSONObject(json)
    } catch (error: JSONException) {
      return false
    }
    val day = root.optJSONObject("days")?.optJSONObject(WidgetClock.todayKey(nowMs)) ?: return false
    val items = day.optJSONArray("items") ?: return false
    for (index in 0 until items.length()) {
      val item = items.optJSONObject(index) ?: continue
      if (item.optString("i", "") != id) continue
      val done = item.optInt("x", 0) != 1
      item.put("x", if (done) 1 else 0)
      day.put("done", (day.optInt("done", 0) + if (done) 1 else -1).coerceIn(0, day.optInt("n", 0)))
      WidgetStore.save(context, root.toString())
      WidgetStore.saveToggles(context, queued(WidgetStore.loadToggles(context), id, done, nowMs))
      return true
    }
    return false
  }

  /** The queue with the wish for `id` replaced by this one: only the last wish per task matters. */
  private fun queued(existing: String, id: String, done: Boolean, at: Long): String {
    val old = readQueue(existing)
    val entries = ArrayList<JSONObject>()
    var lastAt = 0L
    for (index in 0 until old.length()) {
      val entry = old.optJSONObject(index) ?: continue
      lastAt = maxOf(lastAt, entry.optLong("at", 0L))
      if (entry.optString("id", "") != id) entries.add(entry)
    }
    // Receipts are the `at` times, so two entries must never share one.
    entries.add(JSONObject().put("id", id).put("done", done).put("at", maxOf(at, lastAt + 1)))
    val result = JSONArray()
    for (entry in entries.takeLast(MAX_QUEUE)) result.put(entry)
    return result.toString()
  }

  private fun readQueue(json: String): JSONArray = try {
    JSONArray(json)
  } catch (error: JSONException) {
    JSONArray()
  }
}
