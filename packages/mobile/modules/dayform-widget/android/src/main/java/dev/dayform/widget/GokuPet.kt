package dev.dayform.widget

import java.util.Random
import kotlin.math.PI
import kotlin.math.sin

/**
 * Goku's script is a short film, not a stroll: six scenes that repeat (about 46 seconds; one tick is one flip of the widget,
 * 300 ms). Every character frame of the sprite sheet is in it.
 *
 *  1. Start: stances, hair and clothes stirring (the blurred frames), grey energy gathering.
 *  2. Combo: a dash behind speed lines, punches, uppercuts, a jump, spinning kicks with a spark; the blue-skinned
 *     opponent is hit, thrown back, lies down and is dizzy.
 *  3. Charge: he turns away, charges a growing blue ball, fires a first black beam, raises the spirit-bomb pose, the
 *     grey aura shakes and the screen flashes white.
 *  4. Transformation: head bowed, eyes flaring red, a burst under the white screen, the hair turns white, the blue aura,
 *     a zoomed-in sprite, white stances.
 *  5. Finisher: a white-haired fight, the big ball, thin then big beams, an explosion with flashes, the recoil.
 *  6. End: the flash fades, the aura calms, the stance, victory poses.
 *
 * Fighting-game timing: a hit frame is held one extra tick (hit-stop), a flash lasts one or two ticks, a shake is a few
 * ticks of the sprite jittering. A launcher cannot shake the screen or zoom a camera, so the shake is the sprite
 * jittering, the zoom is a bigger sprite, and the white flashes are the full-card layer of the widget (WidgetPet.Frame.fx).
 * The art faces right. Frames are `dayform_pet_goku_<set>_<n>`; the mood of the day does not change the film. A pet that
 * does not stroll plays it in the corner without the moves along the card.
 */
internal object GokuPet {
  const val ART = "goku"

  private const val DASH_SHARE = 0.45f
  private const val LUNGE_DP = 4f
  private const val JUMP_DP = 22f

  private enum class Pos { HOME, DASH }

  /**
   * One set of frames played in order. `from`..`to` is how far along the card it moves while it plays; `lunge` pushes
   * every other frame forward; frames from `shakeFrom` up to `shakeTo` jitter by `shake` dp; `arc` lifts the middle of the set;
   * `fx` gives the full-card layer of each frame; `hold` is how many ticks every frame lasts (slow scenes); `stops` are frames held one extra tick (hit-stop).
   */
  private class Seg(
    val set: String,
    val from: Pos,
    val to: Pos = from,
    val lunge: Float = 0f,
    val shake: Float = 0f,
    val shakeFrom: Int = 0,
    val shakeTo: Int = Int.MAX_VALUE,
    val arc: Float = 0f,
    val fx: IntArray? = null,
    val stops: Set<Int> = emptySet(),
    val hold: Int = 1,
  )

  private const val N = WidgetPet.FX_NONE
  private const val F25 = WidgetPet.FX_FLASH_25
  private const val F50 = WidgetPet.FX_FLASH_50
  private const val F75 = WidgetPet.FX_FLASH_75
  private const val F100 = WidgetPet.FX_FLASH_100

  private val FILM = listOf(
    // 1. Start
    Seg("intro", Pos.HOME, shake = 1.5f, shakeFrom = 9),
    // 2. Combo
    Seg("dash", Pos.HOME, Pos.DASH),
    Seg("punch", Pos.DASH, lunge = LUNGE_DP, stops = setOf(1)),
    Seg("upper", Pos.DASH, lunge = LUNGE_DP),
    Seg("air", Pos.DASH, arc = JUMP_DP),
    Seg("kick", Pos.DASH, lunge = LUNGE_DP, shake = 3f, shakeFrom = 2, fx = intArrayOf(N, N, F25, N, N), stops = setOf(2)),
    Seg("duel", Pos.DASH, shake = 2f, shakeTo = 3, stops = setOf(0)),
    // 3. Charge
    Seg("back", Pos.DASH, Pos.HOME),
    Seg("charge", Pos.HOME, hold = 2),
    Seg("shot", Pos.HOME, shake = 3f, hold = 2),
    Seg("bomb", Pos.HOME, shake = 2f, hold = 3),
    Seg("gather", Pos.HOME, shake = 2f, fx = intArrayOf(N, N, F75)),
    // 4. Transformation
    Seg("bow", Pos.HOME, shake = 3f, shakeFrom = 1, fx = intArrayOf(N, F50, F75, F100, F75)),
    Seg("rise", Pos.HOME, fx = intArrayOf(F50)),
    Seg("aura", Pos.HOME, fx = intArrayOf(F25, N, N)),
    Seg("poses", Pos.HOME),
    // 5. Finisher
    Seg("wfight", Pos.HOME, Pos.DASH, lunge = LUNGE_DP, stops = setOf(3)),
    Seg("wkick", Pos.DASH, Pos.HOME, lunge = LUNGE_DP),
    Seg("cast", Pos.HOME, hold = 3),
    Seg("bombw", Pos.HOME, hold = 2),
    Seg("thin", Pos.HOME, shake = 2f, hold = 3),
    Seg("beam", Pos.HOME, shake = 3f, hold = 3),
    Seg("boom", Pos.HOME, shake = 3f, shakeTo = 4, fx = intArrayOf(F50, F100, F100), stops = setOf(1), hold = 2),
    Seg("recoil", Pos.HOME, shake = 3f, shakeTo = 2, fx = intArrayOf(F75, F50, F25) + IntArray(8) { N }),
    // 6. End
    Seg("fade", Pos.HOME, fx = intArrayOf(F75, F50, F25)),
    Seg("stand", Pos.HOME),
    Seg("win", Pos.HOME),
  )

  fun script(sprites: WidgetPet.Sprites, mood: PetMood, roams: Boolean, areaW: Float, areaH: Float, random: Random): List<WidgetPet.Frame> {
    val sets = FILM.map { it.set }.distinct().associateWith { sprites.frames(it, true) }
    // A build whose art lacks any set of the film cannot play it.
    if (sets.values.any { it.isEmpty() }) return emptyList()
    val home = if (roams) areaW * 0.4f else areaW
    val dash = if (roams) (home + areaW * DASH_SHARE).coerceAtMost(areaW) else home
    fun at(pos: Pos) = if (pos == Pos.HOME) home else dash
    val out = ArrayList<WidgetPet.Frame>(130)

    for (seg in FILM) {
      val frames = sets.getValue(seg.set)
      val x0 = at(seg.from)
      val x1 = at(seg.to)
      for (i in frames.indices) {
        val along = x0 + (x1 - x0) * (i + 1) / frames.size
        val jitter = if (seg.shake != 0f && i >= seg.shakeFrom && i < seg.shakeTo) (if (out.size % 2 == 0) seg.shake else -seg.shake) else 0f
        val x = (along + (if (i % 2 == 1) seg.lunge else 0f) + jitter).coerceIn(0f, areaW)
        val lift = if (seg.arc != 0f) sin(PI * (i + 0.5) / frames.size).toFloat() * seg.arc else 0f
        val step = if (areaW <= 0f) WidgetPet.STEPS else (x / areaW * WidgetPet.STEPS + 0.5f).toInt().coerceIn(0, WidgetPet.STEPS)
        val fx = seg.fx?.getOrNull(i) ?: N
        repeat(seg.hold + (if (i in seg.stops) 1 else 0)) { out.add(WidgetPet.Frame(frames[i], step, lift.toInt(), fx)) }
      }
    }
    return out
  }
}
