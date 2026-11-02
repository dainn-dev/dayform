package dev.dayform.widget

import java.util.Random
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

/**
 * The Love pet: Boy and Girl, two characters with a script each (Boy in the widget's first ViewFlipper, Girl in the second).
 * A launcher cannot run logic while the widget is shown, so the whole loop is planned in advance. The card is split into
 * a few small zones across its width and the loop holds one scene in each of two different zones, so the flowers are given in
 * different places instead of one spot that repeats:
 *
 *  1. Each of them wanders on their own for a while: walks, runs, looks around, sits, barks (their own random path and poses).
 *  2. Girl picks a spot inside the scene's zone and walks (or runs) there, then stops and looks around while Boy comes up to
 *     her, running when she is far. A scene only starts when the two face each other: Boy watches the spot she is heading for
 *     (he never stands with his back to it) and Girl turns toward the side he comes from, so nobody is ever approached from
 *     behind or runs up to someone who looks away.
 *  3. Boy gives her the flowers (`dayform_pet_boy_gift_*`) while Girl receives them (`dayform_pet_girl_receive_*`), turned
 *     toward each other, then they sit down side by side, shoulder to shoulder, for a while.
 *  4. The next scene is in another zone; after the last one each walks back to where they began, so the loop restarts without
 *     a jump.
 *
 * A loop repeats unchanged, so the rest between two scenes (also from the last scene to the first one of the next loop) is
 * at least COOLDOWN_SECONDS (29): where the wandering and the walk to the spot are too short for that, both sit for a while
 * first. A narrow card has fewer zones and so fewer scenes, and a loop that comes out too long has just one scene. From the
 * handover to the end of the sitting a heart border frames the whole card.
 * When they rest (the pet does not stroll, or the day is done) they sleep side by side in the corner, out of step.
 * Frames are `dayform_pet_<boy|girl>_<set>_<dir>_<n>`, like the other pets; the art faces right and `_l` is its mirror.
 */
internal object LovePet {
  const val ART = "boy"
  const val PARTNER_ART = "girl"

  /** The two scripts, one per ViewFlipper. They always have the same length, so the flippers stay in step. */
  internal class Duo(val boy: List<WidgetPet.Frame>, val girl: List<WidgetPet.Frame>)

  /** Boy stands this far (dp) from Girl: the tip of his bouquet reaches her hands (measured on the frames). */
  private const val GIFT_GAP_DP = 26f
  private const val GIFT_TICKS = 16
  /** One tick is one flip of the widget. */
  private const val TICK_MS = 300
  private const val SIT_SECONDS = 10
  private const val SIT_TICKS = (SIT_SECONDS * 1000 + TICK_MS - 1) / TICK_MS
  /** After the flowers they sit side by side: Boy shuffles up to this distance (dp) from Girl (the width of a sitting body), over SHUFFLE_TICKS. */
  private const val SIT_GAP_DP = 18f
  private const val SIT_HOLD = 4
  private const val SHUFFLE_TICKS = 2
  /** Wandering of a card that has no flowers frames (no scene), in ticks. */
  private const val WANDER_TICKS = 36
  /** The rest between two scenes, in seconds. */
  private const val COOLDOWN_SECONDS = 29
  private const val COOLDOWN_TICKS = (COOLDOWN_SECONDS * 1000 + TICK_MS - 1) / TICK_MS
  /** Scenes in one loop (each in a different zone), the zones the width is split into and the least width of a zone (dp). */
  private const val SCENES_PER_LOOP = 2
  private const val MAX_ZONES = 3
  private const val ZONE_MIN_DP = 60f
  /** Each scene is preceded by this much wandering of their own, in ticks. */
  private const val SCENE_WANDER_TICKS = 16
  /** A loop longer than this (ticks, about 108 s) would make the widget heavy to draw: it is planned again with one scene. */
  private const val MAX_LOOP_TICKS = 360
  /** The heart border pulses: full for this many ticks, then soft for as many. */
  private const val HEARTS_PULSE_TICKS = 2
  private const val RUN_ABOVE_DP = 90f
  private const val RETURN_WALK_MAX_TICKS = 36
  private const val REST_GAP_DP = 30f
  private const val IDLE_HOLD = 3
  private const val VERTICAL_PERCENT = 30
  private const val MAX_SLOPE = 0.35f
  private const val MAX_ACTIONS = 200

  fun script(boy: WidgetPet.Sprites, girl: WidgetPet.Sprites, resting: Boolean, areaW: Float, areaH: Float, random: Random): Duo? {
    if (boy.frames("walk", true).isEmpty() || girl.frames("walk", true).isEmpty()) return null
    if (resting) return rest(boy, girl, areaW, random)
    // The plan is a function of the seed, so a loop that came out too long is planned again, with a single scene.
    val seed = random.nextLong()
    val duo = plan(boy, girl, areaW, areaH, SCENES_PER_LOOP, Random(seed))
    return if (duo.boy.size > MAX_LOOP_TICKS) plan(boy, girl, areaW, areaH, 1, Random(seed)) else duo
  }

  /** A stretch of the card's width (dp) in which one scene happens. */
  private class Zone(val from: Float, val to: Float) {
    /** A place inside, kept off its two ends so that Boy has room to stand beside Girl. */
    fun pick(random: Random): Float {
      val margin = min(GIFT_GAP_DP, (to - from) / 3f)
      return from + margin + random.nextFloat() * max(0f, to - from - 2f * margin)
    }
  }

  /** The card's width split into as many zones as fit (at least ZONE_MIN_DP each, at most MAX_ZONES); a narrow card has one. */
  private fun zonesOf(areaW: Float): List<Zone> {
    val count = (areaW / ZONE_MIN_DP).toInt().coerceIn(1, MAX_ZONES)
    return List(count) { i -> Zone(areaW * i / count, areaW * (i + 1) / count) }
  }

  /** Boy takes the side he is already on, unless Girl stands too close to the edge for it. True when he stands on her left. */
  private fun giftSide(boyX: Float, girlX: Float, areaW: Float): Boolean = when {
    girlX - GIFT_GAP_DP < 0f -> false
    girlX + GIFT_GAP_DP > areaW -> true
    else -> boyX < girlX
  }

  /** One loop: both wander, a scene with the flowers in each of up to `scenes` different zones, both walk home. */
  private fun plan(boySprites: WidgetPet.Sprites, girlSprites: WidgetPet.Sprites, areaW: Float, areaH: Float, scenes: Int, random: Random): Duo {
    val boy = Walker(boySprites, areaW, areaH, random, random.nextFloat() * areaW, random.nextFloat() * areaH)
    val girl = Walker(girlSprites, areaW, areaH, random, random.nextFloat() * areaW, random.nextFloat() * areaH)
    val boyHome = boy.x to boy.y
    val girlHome = girl.x to girl.y

    val hasFlowers = boySprites.frames("gift", true).isNotEmpty() && girlSprites.frames("receive", true).isNotEmpty()
    // Different zones for the scenes, in a random order.
    val zones = if (hasFlowers) zonesOf(areaW).shuffled(random).take(minOf(scenes, MAX_ZONES)) else emptyList()
    if (zones.isEmpty()) {
      boy.wander(WANDER_TICKS)
      girl.wander(WANDER_TICKS)
      val ready = max(boy.size, girl.size)
      boy.idleUntil(ready)
      girl.idleUntil(ready)
    }

    val hearts = ArrayList<IntRange>()
    var lastEnd = -1
    var firstGiftStart = -1
    for (zone in zones) {
      // Each does their own thing for a while; then both stand until the later one is done.
      boy.wander(boy.size + SCENE_WANDER_TICKS)
      girl.wander(girl.size + SCENE_WANDER_TICKS)
      val ready = max(boy.size, girl.size)
      boy.idleUntil(ready)
      girl.idleUntil(ready)

      // Girl picks her spot in the zone. The walk there and Boy's way up to her are known, so the tick of the handover is too.
      val spotX = zone.pick(random)
      val spotY = random.nextFloat() * areaH
      val girlRuns = hypot(spotX - girl.x, spotY - girl.y) > RUN_ABOVE_DP
      val sideLeft = giftSide(boy.x, spotX, areaW)
      val targetX = (if (sideLeft) spotX - GIFT_GAP_DP else spotX + GIFT_GAP_DP).coerceIn(0f, areaW)
      val boyRuns = hypot(targetX - boy.x, spotY - boy.y) > RUN_ABOVE_DP
      // Boy turns to the spot Girl is heading for before anything else (the sitting or looking he does while he waits shows his
      // face to it, not his back); she sets off towards it.
      boy.face(spotX)
      girl.face(spotX)
      val giftStart = ready + girl.tripTicks(spotX, spotY, girlRuns) + boy.tripTicks(targetX, spotY, boyRuns)
      // Where the rest since the last scene would be shorter than the cooldown, they sit for the missing time first.
      val pad = if (lastEnd >= 0) max(0, lastEnd + COOLDOWN_TICKS - giftStart) else 0
      if (pad > 0) {
        boy.pose("sit", pad, IDLE_HOLD)
        girl.pose("sit", pad, IDLE_HOLD)
      }
      girl.goTo(spotX, spotY, girlRuns)
      boy.idleUntil(girl.size)
      val given = meet(boy, girl, boySprites, girlSprites, areaW)
      hearts.add(given)
      if (firstGiftStart < 0) firstGiftStart = given.first - GIFT_TICKS / 2
      lastEnd = boy.size
    }

    boy.goTo(boyHome.first, boyHome.second, run = hypot(boyHome.first - boy.x, boyHome.second - boy.y) / WidgetPet.WALK_STEP_DP > RETURN_WALK_MAX_TICKS)
    girl.goTo(girlHome.first, girlHome.second, run = hypot(girlHome.first - girl.x, girlHome.second - girl.y) / WidgetPet.WALK_STEP_DP > RETURN_WALK_MAX_TICKS)
    // The loop repeats, so the rest from the last scene to the first scene of the next loop must be long enough too.
    val wrapMin = if (lastEnd >= 0) lastEnd + COOLDOWN_TICKS - firstGiftStart else 0
    val end = max(max(boy.size, girl.size), wrapMin)
    boy.idleUntil(end)
    girl.idleUntil(end)
    // The heart border belongs to the whole card, so it rides on Boy's frames (the widget reads the fx layer from the first script).
    val boyFrames = boy.frames.mapIndexed { tick, frame ->
      val shown = hearts.firstOrNull { tick in it }
      if (shown != null) frame.copy(fx = if ((tick - shown.first) / HEARTS_PULSE_TICKS % 2 == 0) WidgetPet.FX_HEARTS else WidgetPet.FX_HEARTS_SOFT) else frame
    }
    return Duo(boyFrames, girl.frames)
  }

  /**
   * Girl waits and looks around, Boy comes to her side, gives her the flowers and they sit down close together. Returns the
   * ticks from the handover to the end of the sitting (when the heart border shows).
   */
  private fun meet(boy: Walker, girl: Walker, boySprites: WidgetPet.Sprites, girlSprites: WidgetPet.Sprites, areaW: Float): IntRange {
    val boyOnLeft = giftSide(boy.x, girl.x, areaW)
    val targetX = (if (boyOnLeft) girl.x - GIFT_GAP_DP else girl.x + GIFT_GAP_DP).coerceIn(0f, areaW)
    // The two face each other from the start: Girl turns to the side he comes from (she may have walked in from the other
    // side, with her back to him) and Boy, who walks towards her, faces her all the way.
    girl.face(targetX)
    boy.face(girl.x)
    val before = boy.size
    boy.goTo(targetX, girl.y, run = hypot(targetX - boy.x, girl.y - boy.y) > RUN_ABOVE_DP)
    girl.pose("look", boy.size - before, IDLE_HOLD)

    // Boy on the left faces right (gift_r); Girl faces him, so left (receive_l).
    val gift = boySprites.frames("gift", boyOnLeft)
    val receive = girlSprites.frames("receive", !boyOnLeft)
    // There is one bouquet: first Boy holds it out (every frame of his but the last) while Girl waits with empty hands (her
    // first frame); then it changes hands: Boy's last frame has empty hands and Girl's other frames hold the flowers.
    val offer = GIFT_TICKS / 2
    for (tick in 0 until offer) {
      boy.add(gift, tick * (gift.size - 1) / offer, boy.x, boy.y)
      girl.add(receive, 0, girl.x, girl.y)
    }
    val handover = boy.size
    for (tick in 0 until GIFT_TICKS - offer) {
      boy.add(gift, gift.size - 1, boy.x, boy.y)
      girl.add(receive, 1 + tick * (receive.size - 1) / (GIFT_TICKS - offer), girl.x, girl.y)
    }
    // Then they sit down shoulder to shoulder: Boy shuffles up to her side while Girl stays where she is.
    val sitX = (if (boyOnLeft) girl.x - SIT_GAP_DP else girl.x + SIT_GAP_DP).coerceIn(0f, areaW)
    boy.sitAt(sitX, SIT_TICKS, SIT_HOLD)
    girl.pose("sit", SIT_TICKS, SIT_HOLD)
    return handover until boy.size
  }

  /** Both in the corner, Boy at the right edge and Girl beside him, asleep or sitting up out of step. */
  private fun rest(boy: WidgetPet.Sprites, girl: WidgetPet.Sprites, areaW: Float, random: Random): Duo? {
    val gapSteps = if (areaW <= 0f) 0 else (REST_GAP_DP / areaW * WidgetPet.STEPS + 0.5f).toInt()
    val boyFrames = WidgetPet.restScript(boy, random)
    val girlFrames = WidgetPet.restScript(girl, random, (WidgetPet.STEPS - gapSteps).coerceAtLeast(0))
    if (boyFrames.isEmpty() || girlFrames.isEmpty()) return null
    return Duo(boyFrames.take(WidgetPet.TICKS), girlFrames.take(WidgetPet.TICKS))
  }

  /** One character: where it is, the frames so far and its place at every tick (to find out when the two are near). */
  private class Walker(
    private val sprites: WidgetPet.Sprites,
    private val areaW: Float,
    private val areaH: Float,
    private val random: Random,
    var x: Float,
    var y: Float,
  ) {
    val frames = ArrayList<WidgetPet.Frame>()
    val xs = ArrayList<Float>()
    val ys = ArrayList<Float>()
    private var right = x < areaW / 2
    val size: Int get() = frames.size

    fun add(drawables: List<Int>, index: Int, atX: Float, atY: Float) {
      val step = if (areaW <= 0f) WidgetPet.STEPS else (atX / areaW * WidgetPet.STEPS + 0.5f).toInt().coerceIn(0, WidgetPet.STEPS)
      frames.add(WidgetPet.Frame(drawables[index % drawables.size], step, atY.toInt()))
      xs.add(atX)
      ys.add(atY)
    }

    /** Turns to face a place (it keeps its way when the place is straight above or below it). */
    fun face(toX: Float) {
      if (abs(toX - x) > 1f) right = toX > x
    }

    /** Stands still playing a front-facing set (the fallback is the look-around). */
    fun pose(set: String, ticks: Int, hold: Int) {
      val drawables = sprites.frames(set, right).ifEmpty { sprites.frames("look", right) }
      if (drawables.isEmpty()) return
      for (tick in 0 until ticks) add(drawables, tick / hold, x, y)
    }

    /** Sits (front-facing) while moving along to `toX` in the first SHUFFLE_TICKS ticks, then stays there. */
    fun sitAt(toX: Float, ticks: Int, hold: Int) {
      val drawables = sprites.frames("sit", right).ifEmpty { sprites.frames("look", right) }
      if (drawables.isEmpty()) return
      val fromX = x
      for (tick in 0 until ticks) add(drawables, tick / hold, fromX + (toX - fromX) * min(1f, (tick + 1f) / SHUFFLE_TICKS), y)
      x = toX
    }

    fun idleUntil(length: Int) {
      if (size < length) pose("look", length - size, IDLE_HOLD)
    }

    /** How many ticks `goTo` would take from here, without moving (the same steps: first straight up or down, then sideways). */
    fun tripTicks(toX: Float, toY: Float, run: Boolean): Int {
      var ticks = 0
      var currentY = y
      val rise = toY - y
      val vertical = if (rise > 0f) sprites.up("walk") else sprites.down("walk")
      if (abs(rise) >= WidgetPet.MIN_VERTICAL_DP && vertical.isNotEmpty()) {
        ticks += stepsFor(abs(rise), WidgetPet.WALK_STEP_DP)
        currentY = toY
      }
      val distance = hypot(toX - x, toY - currentY)
      if (distance < 1f) return ticks
      return ticks + stepsFor(distance, if (run) WidgetPet.RUN_STEP_DP else WidgetPet.WALK_STEP_DP)
    }

    private fun stepsFor(distance: Float, step: Float): Int = ceil(distance / step).toInt().coerceAtLeast(1)

    /** Makes this script exactly `tick` ticks long: cut where it is longer, standing and looking around where it is shorter. */
    fun settleAt(tick: Int) {
      while (frames.size > tick) {
        frames.removeAt(frames.lastIndex)
        xs.removeAt(xs.lastIndex)
        ys.removeAt(ys.lastIndex)
      }
      if (xs.isNotEmpty()) {
        x = xs.last()
        y = ys.last().coerceIn(0f, areaH)
      }
      idleUntil(tick)
    }

    /** Random actions until the script is `until` ticks long (the last one may run over). */
    fun wander(until: Int) {
      var actions = 0
      while (size < until && actions++ < MAX_ACTIONS) {
        val roll = random.nextInt(100)
        when {
          roll < 55 -> trip(false)
          roll < 68 -> trip(true)
          roll < 82 -> pose("look", 6 + random.nextInt(9), IDLE_HOLD)
          roll < 94 -> pose("sit", 6 + random.nextInt(9), IDLE_HOLD)
          else -> pose("bark", 6 + random.nextInt(7), IDLE_HOLD)
        }
      }
    }

    /** A walk (or run) to a random place: sideways with a gentle slope, or straight up or down when the art has the frames. */
    private fun trip(run: Boolean) {
      val canVertical = sprites.up("walk").isNotEmpty() && sprites.down("walk").isNotEmpty() && areaH >= 2f * WidgetPet.MIN_VERTICAL_DP
      if (canVertical && random.nextInt(100) < VERTICAL_PERCENT) {
        val targetY = if (y > areaH / 2f) random.nextFloat() * (y - WidgetPet.MIN_VERTICAL_DP) else y + WidgetPet.MIN_VERTICAL_DP + random.nextFloat() * (areaH - y - WidgetPet.MIN_VERTICAL_DP)
        goTo(x, targetY, false)
        return
      }
      var targetX = random.nextFloat() * areaW
      if (abs(targetX - x) < WidgetPet.MIN_TRIP_DP) targetX = if (x > areaW / 2f) x - WidgetPet.MIN_TRIP_DP - random.nextFloat() * 40f else x + WidgetPet.MIN_TRIP_DP + random.nextFloat() * 40f
      targetX = targetX.coerceIn(0f, areaW)
      val reach = (abs(targetX - x) * MAX_SLOPE).coerceAtMost(areaH)
      val targetY = (y + (random.nextFloat() * 2f - 1f) * reach).coerceIn(0f, areaH)
      goTo(targetX, targetY, run)
    }

    /** Walks (or runs) to the place: first straight up or down when it is far in height, then sideways facing the way it goes. */
    fun goTo(toX: Float, toY: Float, run: Boolean) {
      val rise = toY - y
      val vertical = if (rise > 0f) sprites.up("walk") else sprites.down("walk")
      if (abs(rise) >= WidgetPet.MIN_VERTICAL_DP && vertical.isNotEmpty()) travel(vertical, x, toY, WidgetPet.WALK_STEP_DP, 0f)
      if (hypot(toX - x, toY - y) < 1f) return
      if (abs(toX - x) > 1f) right = toX > x
      val sideways = (if (run) sprites.frames("run", right) else emptyList()).ifEmpty { sprites.frames("walk", right) }
      travel(sideways, toX, toY, if (run) WidgetPet.RUN_STEP_DP else WidgetPet.WALK_STEP_DP, if (run) WidgetPet.RUN_BOB_DP else WidgetPet.WALK_BOB_DP)
    }

    private fun travel(moving: List<Int>, toX: Float, toY: Float, step: Float, bob: Float) {
      val startX = x
      val startY = y
      val trip = ceil(hypot(toX - startX, toY - startY) / step).toInt().coerceAtLeast(1)
      for (tick in 1..trip) {
        add(moving, tick, startX + (toX - startX) * tick / trip, startY + (toY - startY) * tick / trip + WidgetPet.stepBob(tick, moving.size, bob))
      }
      x = toX
      y = toY
    }
  }
}
