package dev.dayform.widget

import java.util.Random
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.sin

/**
 * Goku's own script. He is a fighter on the ground, not a stroller: he shuffles in his stance, dashes from side to side,
 * stops to train (combos of punches, an uppercut or kicks, each lunging a little forward), jumps, and now and then is
 * knocked down, lies there dizzy and gets up. Cheering days are jumps, dashes and victory poses; resting days are mostly
 * lying down. Frames are `dayform_pet_goku_<set>_<l|r>_<n>` (the art faces right, the left set is its mirror) and
 * `dayform_pet_goku_walk_u_<n>` (seen from behind, for going up the card).
 */
internal object GokuPet {
  const val ART = "goku"

  private const val TICKS = 160
  private const val RETURN_RESERVE_TICKS = 36
  private const val WALK_STEP_DP = 5f
  private const val DASH_STEP_DP = 13f
  private const val MIN_TRIP_DP = 40f
  private const val MAX_SLOPE = 0.3f
  private const val WALK_BOB_DP = 1.5f
  private const val DASH_BOB_DP = 2.5f
  private const val JUMP_HEIGHT_DP = 24f
  private const val LUNGE_DP = 4f
  private const val EDGE_MARGIN_DP = 30f
  private const val MIN_VERTICAL_DP = 16f

  private enum class Move { WALK, DASH, JUMP, PUNCH, UPPERCUT, KICK, KNOCKDOWN, LOOK, REST, SLEEP, DIZZY, CELEBRATE }

  private fun moves(mood: PetMood, roams: Boolean): List<Pair<Move, Int>> = when (mood) {
    PetMood.WALKING ->
      if (roams) listOf(Move.WALK to 24, Move.DASH to 14, Move.PUNCH to 12, Move.KICK to 10, Move.UPPERCUT to 6, Move.JUMP to 8, Move.LOOK to 10, Move.KNOCKDOWN to 3, Move.REST to 8)
      else listOf(Move.PUNCH to 24, Move.KICK to 20, Move.UPPERCUT to 12, Move.JUMP to 14, Move.LOOK to 16, Move.REST to 14)
    PetMood.CHEERING ->
      if (roams) listOf(Move.JUMP to 22, Move.DASH to 22, Move.CELEBRATE to 20, Move.PUNCH to 10, Move.KICK to 10, Move.WALK to 10)
      else listOf(Move.JUMP to 40, Move.CELEBRATE to 40, Move.PUNCH to 10, Move.KICK to 10)
    PetMood.RESTING ->
      if (roams) listOf(Move.SLEEP to 40, Move.REST to 25, Move.DIZZY to 8, Move.LOOK to 12, Move.WALK to 12)
      else listOf(Move.SLEEP to 60, Move.REST to 25, Move.LOOK to 10, Move.DIZZY to 5)
  }

  fun script(sprites: WidgetPet.Sprites, mood: PetMood, roams: Boolean, areaW: Float, areaH: Float, random: Random): List<WidgetPet.Frame> {
    if (sprites.frames("walk", true).isEmpty()) return emptyList()
    val out = ArrayList<WidgetPet.Frame>(TICKS)
    var x = if (roams) random.nextFloat() * areaW else areaW
    var y = if (roams) random.nextFloat() * areaH else 0f
    var right = x < areaW / 2
    val homeX = x
    val homeY = y
    val available = moves(mood, roams).filter { present(sprites, it.first) }
    if (available.isEmpty()) return emptyList()

    fun add(frames: List<Int>, index: Int, atX: Float, atY: Float) {
      val clamped = atX.coerceIn(0f, areaW)
      val step = if (areaW <= 0f) WidgetPet.STEPS else (clamped / areaW * WidgetPet.STEPS + 0.5f).toInt().coerceIn(0, WidgetPet.STEPS)
      out.add(WidgetPet.Frame(frames[index % frames.size], step, atY.coerceAtLeast(0f).toInt()))
    }

    fun travel(moving: List<Int>, toX: Float, toY: Float, step: Float, bob: Float) {
      val startX = x
      val startY = y
      val trip = ceil(hypot(toX - startX, toY - startY) / step).toInt().coerceAtLeast(1)
      for (i in 1..trip) {
        val period = (moving.size / 2).coerceAtLeast(2)
        val hop = abs(sin(PI * (i % period) / period)).toFloat() * bob
        add(moving, i, startX + (toX - startX) * i / trip, startY + (toY - startY) * i / trip + hop)
      }
      x = toX
      y = toY
    }

    /** Plays a set `ticks` frames long in place, lunging `lunge` dp forward on every other frame (facing `dir`). */
    fun play(set: String, ticks: Int, hold: Int, lunge: Float) {
      val frames = sprites.frames(set, right)
      if (frames.isEmpty()) return
      val dir = if (right) 1f else -1f
      for (i in 0 until ticks) add(frames, i / hold, x + (if (i % 2 == 1) dir * lunge else 0f), y)
    }

    val edges = if (roams) mutableListOf(0f, areaW).apply { shuffle(random) } else mutableListOf<Float>()
    var leaveWall = false

    while (out.size < TICKS - RETURN_RESERVE_TICKS) {
      val edgeDue = if (edges.size == 2) 0 else TICKS / 2
      val edge = if (edges.isNotEmpty() && out.size >= edgeDue) edges.removeAt(0) else null
      val move = when {
        edge != null -> if (present(sprites, Move.DASH) && random.nextInt(3) == 0) Move.DASH else Move.WALK
        leaveWall -> Move.WALK
        else -> pick(available, random)
      }
      if (edge == null) leaveWall = false
      // Next to a side edge he faces away from it, so a stop or an attack there never points at the wall.
      val awayFromWall = if (x < EDGE_MARGIN_DP) true else if (x > areaW - EDGE_MARGIN_DP) false else right
      when (move) {
        Move.WALK, Move.DASH -> {
          val up = if (edge == null && move == Move.WALK && x >= EDGE_MARGIN_DP && x <= areaW - EDGE_MARGIN_DP && areaH - y >= MIN_VERTICAL_DP) sprites.up("walk") else emptyList()
          if (up.isNotEmpty() && random.nextInt(100) < 40) {
            // Up the card he is seen from behind.
            val ty = y + (areaH - y) * (0.5f + 0.5f * random.nextFloat())
            val tx = (x + (random.nextFloat() * 2f - 1f) * abs(ty - y) * 0.2f).coerceIn(0f, areaW)
            travel(up, tx, ty, WALK_STEP_DP, 0f)
          } else {
            var tx = edge ?: (random.nextFloat() * areaW)
            if (edge == null && abs(tx - x) < MIN_TRIP_DP) tx = if (x > areaW / 2) x - MIN_TRIP_DP - random.nextFloat() * 40f else x + MIN_TRIP_DP + random.nextFloat() * 40f
            tx = tx.coerceIn(0f, areaW)
            val reach = (abs(tx - x) * MAX_SLOPE).coerceAtMost(areaH)
            val ty = (y + (random.nextFloat() * 2f - 1f) * reach).coerceIn(0f, areaH)
            if (tx != x) right = tx > x
            val dash = move == Move.DASH
            val frames = sprites.frames(if (dash) "run" else "walk", right)
            travel(frames.ifEmpty { sprites.frames("walk", right) }, tx, ty, if (dash) DASH_STEP_DP else WALK_STEP_DP, if (dash) DASH_BOB_DP else WALK_BOB_DP)
          }
          if (edge != null) {
            // At the wall he stops, turns and looks around instead of running into it.
            right = x < areaW / 2
            play("look", 6 + random.nextInt(4), 2, 0f)
            leaveWall = true
          }
        }
        Move.JUMP -> {
          right = awayFromWall
          val frames = sprites.frames("jump", right)
          val ticks = 9 + random.nextInt(4)
          for (i in 0 until ticks) add(frames, i * frames.size / ticks, x, y + sin(PI * i / ticks).toFloat() * JUMP_HEIGHT_DP)
        }
        Move.PUNCH -> { right = awayFromWall; play("punch", 8 + 2 * random.nextInt(3), 1, LUNGE_DP) }
        Move.UPPERCUT -> { right = awayFromWall; play("uppercut", 8, 1, LUNGE_DP) }
        Move.KICK -> { right = awayFromWall; play("kick", 8 + 4 * random.nextInt(2), 1, LUNGE_DP * 1.5f) }
        Move.KNOCKDOWN -> {
          // Hit, thrown back, flat on the ground for a while, then up on his feet again.
          right = awayFromWall
          val dir = if (right) -1f else 1f
          val hit = sprites.frames("hit", right)
          val fall = sprites.frames("fall", right)
          for (i in 0 until 4) add(hit, i, x + dir * 3f * i, y)
          x = (x + dir * 9f).coerceIn(0f, areaW)
          for (i in 0 until 3) add(fall, i, x, y)
          play("sleep", 8 + random.nextInt(6), 4, 0f)
          play("dizzy", 4, 1, 0f)
          play("sit", 4, 2, 0f)
        }
        Move.DIZZY -> { right = awayFromWall; play("dizzy", 8, 1, 0f) }
        Move.LOOK -> { right = awayFromWall; play("look", 8 + random.nextInt(5), 2, 0f) }
        Move.REST -> { right = awayFromWall; play("sit", 8 + random.nextInt(7), 3, 0f) }
        Move.SLEEP -> { right = awayFromWall; play("sleep", 16 + random.nextInt(16), 4, 0f) }
        Move.CELEBRATE -> {
          right = awayFromWall
          play("sit", 8, 2, 0f)
          val frames = sprites.frames("jump", right)
          for (i in 0 until 10) add(frames, i * frames.size / 10, x, y + sin(PI * i / 10).toFloat() * JUMP_HEIGHT_DP)
        }
      }
    }
    // Close the loop: he ends where he began, so the next loop starts without a jump across the card.
    if (roams && (abs(x - homeX) > 1f || abs(y - homeY) > 1f)) {
      right = homeX > x
      val dash = sprites.frames("run", right).isNotEmpty()
      travel(sprites.frames(if (dash) "run" else "walk", right), homeX, homeY, if (dash) DASH_STEP_DP else WALK_STEP_DP, if (dash) DASH_BOB_DP else WALK_BOB_DP)
    }
    return out
  }

  /** A move is offered only when the art has the frames it needs. */
  private fun present(sprites: WidgetPet.Sprites, move: Move): Boolean = when (move) {
    Move.WALK -> sprites.frames("walk", true).isNotEmpty()
    Move.DASH -> sprites.frames("run", true).isNotEmpty()
    Move.JUMP, Move.CELEBRATE -> sprites.frames("jump", true).isNotEmpty() && sprites.frames("sit", true).isNotEmpty()
    Move.PUNCH -> sprites.frames("punch", true).isNotEmpty()
    Move.UPPERCUT -> sprites.frames("uppercut", true).isNotEmpty()
    Move.KICK -> sprites.frames("kick", true).isNotEmpty()
    Move.KNOCKDOWN -> listOf("hit", "fall", "sleep", "dizzy", "sit").all { sprites.frames(it, true).isNotEmpty() }
    Move.LOOK -> sprites.frames("look", true).isNotEmpty()
    Move.REST -> sprites.frames("sit", true).isNotEmpty()
    Move.SLEEP -> sprites.frames("sleep", true).isNotEmpty()
    Move.DIZZY -> sprites.frames("dizzy", true).isNotEmpty()
  }

  private fun pick(options: List<Pair<Move, Int>>, random: Random): Move {
    var roll = random.nextInt(options.sumOf { it.second })
    for ((move, weight) in options) {
      if (roll < weight) return move
      roll -= weight
    }
    return options.last().first
  }
}
