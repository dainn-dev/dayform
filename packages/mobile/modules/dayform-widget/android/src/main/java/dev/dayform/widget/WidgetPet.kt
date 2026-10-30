package dev.dayform.widget

import android.content.Context
import android.view.View
import android.widget.RemoteViews
import java.util.Random
import kotlin.math.PI
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.sin

/** How the day is going, which decides what the pet likes to do. */
internal enum class PetMood { WALKING, CHEERING, RESTING }

/**
 * Draws the user's pet into the widget. A launcher cannot play an animation for a RemoteViews, so the pet is one
 * ViewFlipper whose children are the frames of a short, random "day in the life": each tick the pet is somewhere in
 * the free area below the tasks, doing one thing (walking, running, sitting, looking around, barking, jumping or
 * sleeping). Frames are the drawables `dayform_pet_<art>_<set>_<dir>_<n>` (dir = l or r) or, for art that does not
 * face a side, `dayform_pet_<art>_<set>_<n>`; a pose the art lacks falls back to a similar one.
 */
internal object WidgetPet {
  const val DEFAULT_KIND = "orange-cat"

  /** Pet kinds of the settings page mapped to the name part of their drawables; "off" and unknown kinds draw nothing. */
  private val ART = mapOf("gray-cat" to "gray", "orange-cat" to "orange", "dog" to "dog", "kitsune" to "kitsune")

  private const val SPRITE_DP = 44
  /** The card's left and right padding, and the gap kept under the pet. */
  private const val CARD_PADDING_DP = 28
  private const val BOTTOM_MARGIN_DP = 8
  /** One frame per flip (the layout's flipInterval is 300 ms): 160 ticks is a 48 second stroll before it repeats. */
  private const val TICKS = 160
  private const val WALK_STEP_DP = 6f
  private const val RUN_STEP_DP = 12f
  private const val MIN_TRIP_DP = 40f
  private const val DEFAULT_WIDTH_DP = 250
  private const val JUMP_HEIGHT_DP = 14f

  private enum class Action { WALK, RUN, SIT, LOOK, BARK, SLEEP, JUMP }

  /** One frame of the script: the drawable and where the sprite's bottom-left corner is, in dp from the free area's. */
  private data class Frame(val drawable: Int, val xDp: Int, val yDp: Int)

  /** The drawables of one art, looked up by name once. */
  private class Sprites(private val context: Context, private val art: String) {
    private val cache = HashMap<String, List<Int>>()

    fun frames(set: String, right: Boolean): List<Int> = cache.getOrPut("$set/$right") {
      val sided = find(set, if (right) "r" else "l")
      if (sided.isNotEmpty()) sided else find(set, null)
    }

    private fun find(set: String, dir: String?): List<Int> {
      val found = ArrayList<Int>()
      while (true) {
        val name = "dayform_pet_${art}_${set}_" + (if (dir != null) "${dir}_" else "") + found.size
        val id = context.resources.getIdentifier(name, "drawable", context.packageName)
        if (id == 0) return found
        found.add(id)
      }
    }
  }

  /** `mood` is null when there is no room for the pet; a pet that does not walk stays in the corner. */
  fun bind(context: Context, views: RemoteViews, kind: String, walks: Boolean, mood: PetMood?, widthDp: Int, freeHeightDp: Int) {
    views.removeAllViews(R.id.dayform_widget_pet)
    views.setViewVisibility(R.id.dayform_widget_pet, View.GONE)
    val art = ART[kind] ?: return
    if (mood == null) return
    val width = if (widthDp > 0) widthDp else DEFAULT_WIDTH_DP
    val areaW = (width - CARD_PADDING_DP - SPRITE_DP).coerceAtLeast(0).toFloat()
    val areaH = (freeHeightDp - SPRITE_DP - BOTTOM_MARGIN_DP).coerceAtLeast(0).toFloat()
    val frames = script(Sprites(context, art), mood, walks && areaW >= MIN_TRIP_DP, areaW, areaH, Random(System.currentTimeMillis()))
    if (frames.isEmpty()) return
    val density = context.resources.displayMetrics.density
    for (frame in frames) {
      val view = RemoteViews(context.packageName, R.layout.dayform_pet_frame)
      view.setImageViewResource(R.id.dayform_pet_frame_image, frame.drawable)
      view.setViewPadding(R.id.dayform_pet_frame_root, (frame.xDp * density + 0.5f).toInt(), 0, 0, ((frame.yDp + BOTTOM_MARGIN_DP) * density + 0.5f).toInt())
      views.addView(R.id.dayform_widget_pet, view)
    }
    views.setViewVisibility(R.id.dayform_widget_pet, View.VISIBLE)
  }

  /** Which actions the mood allows, with their weights; poses the art lacks are dropped later. */
  private fun weights(mood: PetMood, walks: Boolean): List<Pair<Action, Int>> = when (mood) {
    PetMood.WALKING ->
      if (walks) listOf(Action.WALK to 40, Action.RUN to 10, Action.SIT to 14, Action.LOOK to 14, Action.SLEEP to 8, Action.BARK to 6)
      else listOf(Action.SIT to 30, Action.LOOK to 30, Action.SLEEP to 25, Action.BARK to 15)
    PetMood.CHEERING ->
      if (walks) listOf(Action.JUMP to 35, Action.RUN to 25, Action.BARK to 25, Action.WALK to 15)
      else listOf(Action.JUMP to 50, Action.BARK to 50)
    PetMood.RESTING ->
      if (walks) listOf(Action.SLEEP to 50, Action.SIT to 22, Action.WALK to 16, Action.LOOK to 12)
      else listOf(Action.SLEEP to 65, Action.SIT to 25, Action.LOOK to 10)
  }

  /** The set of drawables an action uses, or empty when the art has no such pose. */
  private fun setFor(action: Action): List<String> = when (action) {
    Action.WALK -> listOf("walk")
    Action.RUN -> listOf("run")
    Action.SIT -> listOf("sit", "look", "sleep")
    Action.LOOK -> listOf("look", "sit", "sleep")
    Action.BARK -> listOf("bark", "sit")
    Action.SLEEP -> listOf("sleep", "sit")
    Action.JUMP -> listOf("run", "bark", "walk")
  }

  private fun framesOf(sprites: Sprites, action: Action, right: Boolean): List<Int> {
    for (set in setFor(action)) {
      val found = sprites.frames(set, right)
      if (found.isNotEmpty()) return found
    }
    return emptyList()
  }

  private fun script(sprites: Sprites, mood: PetMood, walks: Boolean, areaW: Float, areaH: Float, random: Random): List<Frame> {
    if (sprites.frames("walk", true).isEmpty()) return emptyList()
    val out = ArrayList<Frame>(TICKS)
    var x = if (walks) random.nextFloat() * areaW else areaW
    var y = if (walks) random.nextFloat() * areaH else 0f
    var right = x < areaW / 2
    val allowed = weights(mood, walks).filter { framesOf(sprites, it.first, true).isNotEmpty() }
    if (allowed.isEmpty()) return emptyList()

    fun add(frames: List<Int>, index: Int, atX: Float, atY: Float) {
      out.add(Frame(frames[index % frames.size], atX.toInt(), atY.toInt()))
    }

    while (out.size < TICKS) {
      val action = pick(allowed, random)
      val frames = framesOf(sprites, action, right)
      when (action) {
        Action.WALK, Action.RUN -> {
          var tx = random.nextFloat() * areaW
          if (kotlin.math.abs(tx - x) < MIN_TRIP_DP) tx = if (x > areaW / 2) x - MIN_TRIP_DP - random.nextFloat() * 40f else x + MIN_TRIP_DP + random.nextFloat() * 40f
          tx = tx.coerceIn(0f, areaW)
          val ty = random.nextFloat() * areaH
          if (tx != x) right = tx > x
          val moving = framesOf(sprites, action, right)
          val step = if (action == Action.RUN) RUN_STEP_DP else WALK_STEP_DP
          val startX = x
          val startY = y
          val trip = ceil(hypot(tx - startX, ty - startY) / step).toInt().coerceAtLeast(1)
          // A script that runs out of ticks mid-trip simply ends there; the loop then starts over.
          val ticks = trip.coerceAtMost(TICKS - out.size)
          for (i in 1..ticks) add(moving, i, startX + (tx - startX) * i / trip, startY + (ty - startY) * i / trip)
          x = startX + (tx - startX) * ticks / trip
          y = startY + (ty - startY) * ticks / trip
        }
        Action.JUMP -> {
          val ticks = (8 + random.nextInt(6)).coerceAtMost(TICKS - out.size)
          for (i in 0 until ticks) add(frames, i, x, y + sin(PI * i / ticks).toFloat() * JUMP_HEIGHT_DP)
        }
        else -> {
          val ticks = (if (action == Action.SLEEP) 16 + random.nextInt(16) else 6 + random.nextInt(9)).coerceAtMost(TICKS - out.size)
          // Poses with several frames (zz, a wagging look) change every few ticks, not every flip.
          val hold = if (action == Action.SLEEP) 4 else 3
          for (i in 0 until ticks) add(frames, i / hold, x, y)
        }
      }
    }
    return out
  }

  private fun pick(options: List<Pair<Action, Int>>, random: Random): Action {
    var roll = random.nextInt(options.sumOf { it.second })
    for ((action, weight) in options) {
      if (roll < weight) return action
      roll -= weight
    }
    return options.last().first
  }
}
