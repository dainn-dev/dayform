package dev.dayform.widget

import java.util.Random
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.sin

/**
 * Paimon's own script. She floats, so she never steps: she drifts to any point of the free area (up and down as freely
 * as sideways), keeps a gentle hover bob all the time, and plays one of her own poses (the frames `dayform_pet_paimon_<set>_<n>`
 * rendered from the motions of her Live2D model) at the spot she stopped. Only the `walk` set has a side (`walk_l_` / `walk_r_`).
 */
internal object PaimonPet {
  const val ART = "paimon"

  private const val TICKS = 160
  private const val RETURN_RESERVE_TICKS = 34
  private const val DRIFT_STEP_DP = 5f
  private const val MIN_TRIP_DP = 36f
  private const val HOVER_BOB_DP = 3f
  private const val BOB_PERIOD_TICKS = 7
  private const val JUMP_HEIGHT_DP = 16f

  /** A pose is a set of frames played once through (or twice), at the spot where she is. */
  private enum class Pose(val set: String) {
    HOVER("sit"), TALK("talk"), WAVE("wave"), EAT("eat"), DRINK("drink"), AHA("aha"), THINK("think"), PROUD("proud"),
    LAUGH("laugh"), BORED("bored"), TIRED("tired"), SURPRISE("surprise"), ANGRY("angry"), KNOW("know"), JOKE("joke"),
    SICK("sick"), SHRUG("shrug"), EXCITED("excited"), WORRY("worry"), SLEEP("sleep"),
  }

  private enum class Move { DRIFT, POSE, LEAP }

  private val WALKING = listOf(
    Pose.HOVER to 12, Pose.TALK to 8, Pose.WAVE to 6, Pose.THINK to 6, Pose.EAT to 4, Pose.DRINK to 4, Pose.AHA to 4,
    Pose.SHRUG to 4, Pose.KNOW to 4, Pose.SURPRISE to 4, Pose.BORED to 4, Pose.WORRY to 3, Pose.LAUGH to 3, Pose.SLEEP to 3,
  )
  private val CHEERING = listOf(
    Pose.LAUGH to 18, Pose.PROUD to 14, Pose.WAVE to 14, Pose.EXCITED to 18, Pose.JOKE to 12, Pose.AHA to 6,
  )
  private val RESTING = listOf(
    Pose.SLEEP to 30, Pose.TIRED to 20, Pose.BORED to 12, Pose.HOVER to 14, Pose.THINK to 8, Pose.SICK to 4, Pose.EAT to 6, Pose.DRINK to 6,
  )

  private fun poses(mood: PetMood): List<Pair<Pose, Int>> = when (mood) {
    PetMood.WALKING -> WALKING
    PetMood.CHEERING -> CHEERING
    PetMood.RESTING -> RESTING
  }

  fun script(sprites: WidgetPet.Sprites, mood: PetMood, roams: Boolean, areaW: Float, areaH: Float, random: Random): List<WidgetPet.Frame> {
    if (sprites.frames("walk", true).isEmpty()) return emptyList()
    val out = ArrayList<WidgetPet.Frame>(TICKS)
    var x = if (roams) random.nextFloat() * areaW else areaW
    var y = if (roams) random.nextFloat() * areaH else 0f
    var right = x < areaW / 2
    val homeX = x
    val homeY = y
    val available = poses(mood).filter { sprites.frames(it.first.set, true).isNotEmpty() }
    if (available.isEmpty()) return emptyList()

    fun add(frames: List<Int>, index: Int, atX: Float, atY: Float) {
      val step = if (areaW <= 0f) WidgetPet.STEPS else (atX / areaW * WidgetPet.STEPS + 0.5f).toInt().coerceIn(0, WidgetPet.STEPS)
      val bob = sin(2.0 * PI * out.size / BOB_PERIOD_TICKS).toFloat() * HOVER_BOB_DP
      out.add(WidgetPet.Frame(frames[index % frames.size], step, (atY + bob).coerceAtLeast(0f).toInt()))
    }

    /** Floats from where she is to (toX, toY): sideways frames facing the way she goes, an eased path, the hover bob on top. */
    fun driftTo(toX: Float, toY: Float) {
      val startX = x
      val startY = y
      if (toX != startX) right = toX > startX
      val frames = sprites.frames("walk", right)
      val trip = ceil(hypot(toX - startX, toY - startY) / DRIFT_STEP_DP).toInt().coerceAtLeast(1)
      for (i in 1..trip) {
        val t = i.toFloat() / trip
        val eased = t * t * (3f - 2f * t)
        add(frames, i, startX + (toX - startX) * eased, startY + (toY - startY) * eased)
      }
      x = toX
      y = toY
    }

    // Like the other pets, every loop touches both side edges, so she is seen to reach each side.
    val edges = if (roams) mutableListOf(0f, areaW).apply { shuffle(random) } else mutableListOf<Float>()

    while (out.size < TICKS - RETURN_RESERVE_TICKS) {
      val edgeDue = if (edges.size == 2) 0 else TICKS / 2
      val edge = if (edges.isNotEmpty() && out.size >= edgeDue) edges.removeAt(0) else null
      val move = when {
        edge != null -> Move.DRIFT
        roams && random.nextInt(100) < (if (mood == PetMood.RESTING) 18 else 38) -> Move.DRIFT
        mood == PetMood.CHEERING && random.nextInt(100) < 20 -> Move.LEAP
        else -> Move.POSE
      }
      when (move) {
        Move.DRIFT -> {
          var tx = edge ?: (random.nextFloat() * areaW)
          if (edge == null && abs(tx - x) < MIN_TRIP_DP) tx = if (x > areaW / 2) x - MIN_TRIP_DP - random.nextFloat() * 40f else x + MIN_TRIP_DP + random.nextFloat() * 40f
          tx = tx.coerceIn(0f, areaW)
          // Flying: the height is as free as the width.
          val ty = random.nextFloat() * areaH
          driftTo(tx, ty)
          if (edge != null) playPose(::add, sprites, Pose.HOVER, x, y, random)
        }
        Move.LEAP -> {
          val frames = sprites.frames(Pose.EXCITED.set, true)
          val ticks = (frames.size * 2).coerceAtLeast(8)
          for (i in 0 until ticks) add(frames, i, x, y + sin(PI * i / ticks).toFloat() * JUMP_HEIGHT_DP)
        }
        Move.POSE -> playPose(::add, sprites, pick(available, random), x, y, random)
      }
    }
    // End where she began, so the next loop starts without a jump across the card.
    if (roams && (abs(x - homeX) > 1f || abs(y - homeY) > 1f)) driftTo(homeX, homeY)
    return out
  }

  private fun playPose(add: (List<Int>, Int, Float, Float) -> Unit, sprites: WidgetPet.Sprites, pose: Pose, x: Float, y: Float, random: Random) {
    val frames = sprites.frames(pose.set, true)
    if (frames.isEmpty()) return
    // A sleeping pose is slow; the others play through once or twice, one frame per tick.
    val hold = if (pose == Pose.SLEEP) 4 else 1
    val loops = if (pose == Pose.SLEEP) 3 + random.nextInt(3) else 1 + random.nextInt(2)
    for (i in 0 until frames.size * hold * loops) add(frames, i / hold, x, y)
  }

  private fun pick(options: List<Pair<Pose, Int>>, random: Random): Pose {
    var roll = random.nextInt(options.sumOf { it.second })
    for ((pose, weight) in options) {
      if (roll < weight) return pose
      roll -= weight
    }
    return options.last().first
  }
}
