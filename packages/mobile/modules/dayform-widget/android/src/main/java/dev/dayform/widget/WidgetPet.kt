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
  const val DEFAULT_KIND = "gray-cat"

  /** Pet kinds of the settings page mapped to the name part of their drawables; "off" and unknown kinds draw nothing. */
  private val ART = mapOf("gray-cat" to "gray", "dog" to "dog", "kitsune" to "kitsune", "chicken" to "chicken", "paimon" to "paimon", "goku" to "goku")

  private const val SPRITE_DP = 44
  /** The card's left and right padding, and the gap kept under the pet. */
  private const val CARD_PADDING_DP = 28
  private const val BOTTOM_MARGIN_DP = 8
  /**
   * One frame per flip (the layout's flipInterval is 300 ms): new actions are planned until the script is this long (about
   * a 48 second stroll), then the pet walks back to where it began, so the loop restarts without a jump.
   */
  private const val TICKS = 160
  private const val RETURN_RESERVE_TICKS = 40
  private const val WALK_STEP_DP = 6f
  private const val RUN_STEP_DP = 12f
  private const val MIN_TRIP_DP = 40f
  private const val DEFAULT_WIDTH_DP = 250
  private const val JUMP_HEIGHT_DP = 14f
  /**
   * The art only walks and runs sideways, so a trip changes height by at most this share of its length (a near
   * horizontal walk, never a slide straight up or down) and the sprite bobs a little with each step.
   */
  private const val MAX_SLOPE = 0.35f
  private const val WALK_BOB_DP = 2f
  private const val RUN_BOB_DP = 3.5f
  /** Share of trips that go straight up or down (when the art has frames for it) and the least height worth it. */
  private const val VERTICAL_PERCENT = 50
  private const val MIN_VERTICAL_DP = 16f
  /** A straight up/down trip only starts this far from both side edges: along an edge it looked like the pet pushing into the wall. */
  private const val EDGE_MARGIN_DP = 30f

  /**
   * The pet's place along the width is one of STEPS + 1 layouts that split the free width by weight (see
   * dayform_pet_frame_NN.xml), not a padding in dp: a launcher may report a stale or too small width after the
   * widget is resized, and a weight still takes the pet all the way to both edges of the real card.
   */
  internal const val STEPS = 40
  private val FRAME_LAYOUTS = intArrayOf(
    R.layout.dayform_pet_frame_00,
    R.layout.dayform_pet_frame_01,
    R.layout.dayform_pet_frame_02,
    R.layout.dayform_pet_frame_03,
    R.layout.dayform_pet_frame_04,
    R.layout.dayform_pet_frame_05,
    R.layout.dayform_pet_frame_06,
    R.layout.dayform_pet_frame_07,
    R.layout.dayform_pet_frame_08,
    R.layout.dayform_pet_frame_09,
    R.layout.dayform_pet_frame_10,
    R.layout.dayform_pet_frame_11,
    R.layout.dayform_pet_frame_12,
    R.layout.dayform_pet_frame_13,
    R.layout.dayform_pet_frame_14,
    R.layout.dayform_pet_frame_15,
    R.layout.dayform_pet_frame_16,
    R.layout.dayform_pet_frame_17,
    R.layout.dayform_pet_frame_18,
    R.layout.dayform_pet_frame_19,
    R.layout.dayform_pet_frame_20,
    R.layout.dayform_pet_frame_21,
    R.layout.dayform_pet_frame_22,
    R.layout.dayform_pet_frame_23,
    R.layout.dayform_pet_frame_24,
    R.layout.dayform_pet_frame_25,
    R.layout.dayform_pet_frame_26,
    R.layout.dayform_pet_frame_27,
    R.layout.dayform_pet_frame_28,
    R.layout.dayform_pet_frame_29,
    R.layout.dayform_pet_frame_30,
    R.layout.dayform_pet_frame_31,
    R.layout.dayform_pet_frame_32,
    R.layout.dayform_pet_frame_33,
    R.layout.dayform_pet_frame_34,
    R.layout.dayform_pet_frame_35,
    R.layout.dayform_pet_frame_36,
    R.layout.dayform_pet_frame_37,
    R.layout.dayform_pet_frame_38,
    R.layout.dayform_pet_frame_39,
    R.layout.dayform_pet_frame_40,
  )

  private enum class Action { WALK, RUN, SIT, LOOK, BARK, SLEEP, JUMP }

  /** One frame of the script: the drawable, how far along the width it is (0..STEPS) and its height above the bottom, in dp. */
  internal data class Frame(val drawable: Int, val step: Int, val yDp: Int, val fx: Int = FX_NONE)

  /** The full-card layer of a frame (`Frame.fx`): nothing, a white flash of 25 / 50 / 75 / 100 %, or a caption. */
  internal const val FX_NONE = 0
  internal const val FX_FLASH_25 = 1
  internal const val FX_FLASH_50 = 2
  internal const val FX_FLASH_75 = 3
  internal const val FX_FLASH_100 = 4
  internal const val FX_CAPTION = 5
  private val FX_LAYOUTS = intArrayOf(
    R.layout.dayform_fx_none,
    R.layout.dayform_fx_flash_25,
    R.layout.dayform_fx_flash_50,
    R.layout.dayform_fx_flash_75,
    R.layout.dayform_fx_flash_100,
    R.layout.dayform_fx_text,
  )

  /** The drawables of one art, looked up by name once. */
  internal class Sprites(private val context: Context, private val art: String) {
    private val cache = HashMap<String, List<Int>>()

    fun frames(set: String, right: Boolean): List<Int> = cache.getOrPut("$set/$right") {
      val sided = find(set, if (right) "r" else "l")
      if (sided.isNotEmpty()) sided else find(set, null)
    }

    /** The frames of a set walking toward the viewer (`dayform_pet_<art>_<set>_d_<n>`), empty when the art has none. */
    fun down(set: String): List<Int> = cache.getOrPut("$set/d") { find(set, "d") }

    /** The frames of a set walking away from the viewer (`dayform_pet_<art>_<set>_u_<n>`), empty when the art has none. */
    fun up(set: String): List<Int> = cache.getOrPut("$set/u") { find(set, "u") }

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
    views.removeAllViews(R.id.dayform_widget_fx)
    views.setViewVisibility(R.id.dayform_widget_fx, View.GONE)
    val art = ART[kind] ?: return
    if (mood == null) return
    val width = if (widthDp > 0) widthDp else DEFAULT_WIDTH_DP
    val areaW = (width - CARD_PADDING_DP - SPRITE_DP).coerceAtLeast(0).toFloat()
    val areaH = (freeHeightDp - SPRITE_DP - BOTTOM_MARGIN_DP).coerceAtLeast(0).toFloat()
    val sprites = Sprites(context, art)
    val random = Random(System.currentTimeMillis())
    val roams = walks && areaW >= MIN_TRIP_DP
    // Paimon floats and Goku fights, so each has their own script (PaimonPet.kt, GokuPet.kt) instead of the walking one.
    val frames = when (art) {
      PaimonPet.ART -> PaimonPet.script(sprites, mood, roams, areaW, areaH, random)
      GokuPet.ART -> GokuPet.script(sprites, mood, roams, areaW, areaH, random)
      else -> script(sprites, mood, roams, areaW, areaH, random)
    }
    if (frames.isEmpty()) return
    val density = context.resources.displayMetrics.density
    for (frame in frames) {
      val view = RemoteViews(context.packageName, FRAME_LAYOUTS[frame.step])
      view.setImageViewResource(R.id.dayform_pet_frame_image, frame.drawable)
      view.setViewPadding(R.id.dayform_pet_frame_root, 0, 0, 0, ((frame.yDp + BOTTOM_MARGIN_DP) * density + 0.5f).toInt())
      views.addView(R.id.dayform_widget_pet, view)
    }
    views.setViewVisibility(R.id.dayform_widget_pet, View.VISIBLE)
    // The full-card layer flips in step with the pet (same interval, one child per frame), and only a script that uses it adds it.
    if (frames.any { it.fx != FX_NONE }) {
      for (frame in frames) views.addView(R.id.dayform_widget_fx, RemoteViews(context.packageName, FX_LAYOUTS[frame.fx.coerceIn(0, FX_LAYOUTS.size - 1)]))
      views.setViewVisibility(R.id.dayform_widget_fx, View.VISIBLE)
    }
  }

  /** Which actions the mood allows, with their weights; poses the art lacks are dropped later. */
  private fun weights(mood: PetMood, walks: Boolean): List<Pair<Action, Int>> = when (mood) {
    PetMood.WALKING ->
      if (walks) listOf(Action.WALK to 40, Action.RUN to 10, Action.SIT to 14, Action.LOOK to 14, Action.SLEEP to 8, Action.BARK to 6)
      else listOf(Action.SIT to 30, Action.LOOK to 30, Action.SLEEP to 25, Action.BARK to 15)
    PetMood.CHEERING ->
      if (walks) listOf(Action.JUMP to 20, Action.RUN to 30, Action.BARK to 15, Action.WALK to 35)
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
    Action.JUMP -> listOf("bark", "run", "walk")
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
    val homeX = x
    val homeY = y
    val allowed = weights(mood, walks).filter { framesOf(sprites, it.first, true).isNotEmpty() }
    if (allowed.isEmpty()) return emptyList()

    fun add(frames: List<Int>, index: Int, atX: Float, atY: Float) {
      val step = if (areaW <= 0f) STEPS else (atX / areaW * STEPS + 0.5f).toInt().coerceIn(0, STEPS)
      out.add(Frame(frames[index % frames.size], step, atY.toInt()))
    }

    /** Walks from where the pet is to (toX, toY) in `step` dp per tick. */
    fun travel(moving: List<Int>, toX: Float, toY: Float, step: Float, bob: Float) {
      val startX = x
      val startY = y
      val trip = ceil(hypot(toX - startX, toY - startY) / step).toInt().coerceAtLeast(1)
      for (i in 1..trip) add(moving, i, startX + (toX - startX) * i / trip, startY + (toY - startY) * i / trip + stepBob(i, moving.size, bob))
      x = toX
      y = toY
    }

    // The loop repeats for as long as the widget is not redrawn, so every loop touches both ends: with only a few random
    // trips per loop, many loops never reached one side and the pet looked as if it could not go there.
    val edges = if (walks) mutableListOf(0f, areaW).apply { shuffle(random) } else mutableListOf<Float>()

    // After its stop at a wall the pet always walks away from it, so it never lingers there jumping or sitting.
    var leaveWall = false

    while (out.size < TICKS - RETURN_RESERVE_TICKS) {
      val edgeDue = if (edges.size == 2) 0 else TICKS / 2
      val edge = if (edges.isNotEmpty() && out.size >= edgeDue) edges.removeAt(0) else null
      val action = when {
        edge != null -> if (allowed.any { it.first == Action.RUN } && random.nextInt(3) == 0) Action.RUN else Action.WALK
        leaveWall -> Action.WALK
        else -> pick(allowed, random)
      }
      if (edge == null) leaveWall = false
      // A pet that stops (or jumps on the spot) next to a side edge faces away from it: running in place into the wall is what
      // a sideways jump or sit looked like there.
      val awayFromWall = if (x < EDGE_MARGIN_DP) true else if (x > areaW - EDGE_MARGIN_DP) false else right
      val frames = framesOf(sprites, action, awayFromWall)
      when (action) {
        Action.WALK, Action.RUN -> {
          // Straight up or down uses the frames that face away from or toward the viewer, when the art has them; without
          // them a trip keeps to a gentle slope.
          val inside = x >= EDGE_MARGIN_DP && x <= areaW - EDGE_MARGIN_DP
          val down = if (edge == null && inside && y >= MIN_VERTICAL_DP) sprites.down("walk") else emptyList()
          val up = if (edge == null && inside && areaH - y >= MIN_VERTICAL_DP) sprites.up("walk") else emptyList()
          val goingUp = up.isNotEmpty() && (down.isEmpty() || random.nextBoolean())
          val vertical = if (goingUp) up else down
          if (vertical.isNotEmpty() && random.nextInt(100) < VERTICAL_PERCENT) {
            val ty = if (goingUp) y + (areaH - y) * (0.5f + 0.5f * random.nextFloat()) else y * 0.5f * random.nextFloat()
            val tx = (x + (random.nextFloat() * 2f - 1f) * kotlin.math.abs(ty - y) * 0.2f).coerceIn(0f, areaW)
            travel(vertical, tx, ty, WALK_STEP_DP, 0f)
          } else {
            var tx = edge ?: (random.nextFloat() * areaW)
            if (edge == null && kotlin.math.abs(tx - x) < MIN_TRIP_DP) tx = if (x > areaW / 2) x - MIN_TRIP_DP - random.nextFloat() * 40f else x + MIN_TRIP_DP + random.nextFloat() * 40f
            tx = tx.coerceIn(0f, areaW)
            val reach = (kotlin.math.abs(tx - x) * MAX_SLOPE).coerceAtMost(areaH)
            val ty = (y + (random.nextFloat() * 2f - 1f) * reach).coerceIn(0f, areaH)
            if (tx != x) right = tx > x
            val running = action == Action.RUN
            travel(framesOf(sprites, action, right), tx, ty, if (running) RUN_STEP_DP else WALK_STEP_DP, if (running) RUN_BOB_DP else WALK_BOB_DP)
          }
          if (edge != null) {
            // At the wall the pet stops and looks around (front facing) instead of walking on into it.
            val pose = framesOf(sprites, Action.LOOK, x < areaW / 2)
            if (pose.isNotEmpty()) for (i in 0 until 5 + random.nextInt(4)) add(pose, i / 3, x, y)
            leaveWall = true
          }
        }
        Action.JUMP -> {
          right = awayFromWall
          val ticks = 8 + random.nextInt(6)
          for (i in 0 until ticks) add(frames, i, x, y + sin(PI * i / ticks).toFloat() * JUMP_HEIGHT_DP)
        }
        else -> {
          right = awayFromWall
          val ticks = if (action == Action.SLEEP) 16 + random.nextInt(16) else 6 + random.nextInt(9)
          // Poses with several frames (zz, a wagging look) change every few ticks, not every flip.
          val hold = if (action == Action.SLEEP) 4 else 3
          for (i in 0 until ticks) add(frames, i / hold, x, y)
        }
      }
    }
    // Close the loop: ending where it began means the next round starts without the pet jumping across the card.
    if (walks && (kotlin.math.abs(x - homeX) > 1f || kotlin.math.abs(y - homeY) > 1f)) {
      val dx = homeX - x
      val dy = homeY - y
      val straight = if (kotlin.math.abs(dy) > 2f * kotlin.math.abs(dx)) (if (dy < 0f) sprites.down("walk") else sprites.up("walk")) else emptyList()
      if (straight.isNotEmpty()) {
        travel(straight, homeX, homeY, WALK_STEP_DP, 0f)
      } else {
        right = dx > 0f
        travel(framesOf(sprites, Action.WALK, right), homeX, homeY, WALK_STEP_DP, WALK_BOB_DP)
      }
    }
    return out
  }

  /** A step is half a stride: the sprite is lowest at the start of a step and highest in the middle of it. */
  private fun stepBob(tick: Int, frameCount: Int, amplitude: Float): Float {
    val period = (frameCount / 2).coerceAtLeast(2)
    return kotlin.math.abs(sin(PI * (tick % period) / period)).toFloat() * amplitude
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
