package dev.dayform.widget

import java.util.Random

/**
 * Goku's script is a short film, not a stroll: six scenes of about 15 seconds that repeat. One tick is one flip of the
 * widget (300 ms), so the scenes take 7 + 10 + 7 + 7 + 10 + 10 = 51 ticks.
 *
 *  1. Start (0-2 s): the fighting stance, hair and clothes stirring, grey energy starting to gather.
 *  2. Combo (2-5 s): a dash forward, three punches, a spinning kick that shakes and sparks.
 *  3. Charge (5-7 s): back to the stance, a blue ball grows between the hands, the aura shakes, a white flash.
 *  4. Transformation (7-9 s): head bowed, a burst under a white screen, the hair turns white, the blue aura, a zoom in.
 *  5. Finisher (9-12 s): a big ball, the beam, an explosion and a flash.
 *  6. End (12-15 s): the flash fades, the aura calms, the "ULTRA INSTINCT" caption, a victory pose held for a second.
 *
 * A launcher cannot shake the screen or zoom a camera, so the shake is the sprite jittering, the zoom is a bigger sprite,
 * and the white flashes and the caption are the full-card layer of the widget (WidgetPet.Frame.fx). The art faces right.
 * Frames are `dayform_pet_goku_<set>_<n>`; the mood of the day does not change the film. A pet that does not stroll
 * plays it in the corner without the dash.
 */
internal object GokuPet {
  const val ART = "goku"

  private const val DASH_SHARE = 0.45f
  private const val LUNGE_DP = 4f
  private const val SHAKE_DP = 3f

  /** Ticks of one scene's set, in the order of the set. */
  fun script(sprites: WidgetPet.Sprites, mood: PetMood, roams: Boolean, areaW: Float, areaH: Float, random: Random): List<WidgetPet.Frame> {
    val sets = SETS.associateWith { sprites.frames(it, true) }
    // A build whose art lacks any set of the film cannot play it.
    if (sets.values.any { it.isEmpty() }) return emptyList()
    val out = ArrayList<WidgetPet.Frame>(51)

    val homeX = if (roams) areaW * 0.4f else areaW
    val dashX = if (roams) (homeX + areaW * DASH_SHARE).coerceAtMost(areaW) else homeX

    fun add(set: String, index: Int, x: Float, fx: Int = WidgetPet.FX_NONE, shake: Float = 0f) {
      val frames = sets.getValue(set)
      val jitter = if (shake != 0f) (if (out.size % 2 == 0) shake else -shake) else 0f
      val at = (x + jitter).coerceIn(0f, areaW)
      val step = if (areaW <= 0f) WidgetPet.STEPS else (at / areaW * WidgetPet.STEPS + 0.5f).toInt().coerceIn(0, WidgetPet.STEPS)
      out.add(WidgetPet.Frame(frames[index % frames.size], step, 0, fx))
    }

    fun lerp(from: Float, to: Float, i: Int, n: Int) = from + (to - from) * (i + 1) / n

    // 1. Start: stance, the blurred frame stirs hair and clothes, the grey aura grows (7 ticks).
    for (i in 0 until 7) add("intro", i, homeX)

    // 2. Combo (10 ticks): dash forward, three punches that lunge, a spinning kick that shakes and sparks.
    for (i in 0 until 4) add("dash", i, lerp(homeX, dashX, i, 4))
    for (i in 0 until 3) add("punch", i, dashX + (if (i % 2 == 1) LUNGE_DP else 0f))
    add("kick", 0, dashX)
    add("kick", 1, dashX + LUNGE_DP, shake = SHAKE_DP)
    add("kick", 2, dashX + LUNGE_DP * 2f, fx = WidgetPet.FX_FLASH_25, shake = SHAKE_DP * 1.5f)

    // 3. Charge (7 ticks): step back, the ball grows, the aura shakes, a white flash at the end.
    for (i in 0 until 2) add("back", i, lerp(dashX, homeX, i, 2))
    for (i in 0 until 3) add("charge", i, homeX)
    add("charge", 3, homeX, shake = SHAKE_DP / 2f)
    add("charge", 4, homeX, fx = WidgetPet.FX_FLASH_75, shake = SHAKE_DP / 2f)

    // 4. Transformation (7 ticks): bow, burst under a white screen, the hair turns white, the blue aura.
    add("bow", 0, homeX)
    add("bow", 1, homeX, fx = WidgetPet.FX_FLASH_50, shake = SHAKE_DP)
    add("bow", 2, homeX, fx = WidgetPet.FX_FLASH_100, shake = SHAKE_DP)
    add("rise", 0, homeX, fx = WidgetPet.FX_FLASH_75)
    add("aura", 0, homeX, fx = WidgetPet.FX_FLASH_25)
    add("aura", 1, homeX)
    add("aura", 2, homeX)

    // 5. Finisher (10 ticks): the big ball, the beam, the explosion and its flash.
    for (i in 0 until 3) add("cast", i, homeX)
    for (i in 0 until 4) add("beam", i, homeX, shake = SHAKE_DP)
    add("boom", 0, homeX, fx = WidgetPet.FX_FLASH_50, shake = SHAKE_DP * 1.5f)
    add("boom", 1, homeX, fx = WidgetPet.FX_FLASH_100, shake = SHAKE_DP * 1.5f)
    add("boom", 2, homeX, fx = WidgetPet.FX_FLASH_100)

    // 6. End (10 ticks): the flash fades, the aura shrinks, the caption, the victory pose.
    add("fade", 0, homeX, fx = WidgetPet.FX_FLASH_75)
    add("fade", 1, homeX, fx = WidgetPet.FX_FLASH_50)
    add("fade", 2, homeX, fx = WidgetPet.FX_FLASH_25)
    for (i in 0 until 3) add("idle", 0, homeX, fx = WidgetPet.FX_CAPTION)
    for (i in 0 until 4) add("win", 0, homeX, fx = WidgetPet.FX_CAPTION)
    return out
  }

  private val SETS = listOf("intro", "dash", "punch", "kick", "back", "charge", "bow", "rise", "aura", "cast", "beam", "boom", "fade", "idle", "win")
}
