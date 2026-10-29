import { z } from "zod";
import { isDateKey, yearsAgo } from "./cycle-date";
import {
  CYCLE_LENGTH_MAX,
  CYCLE_LENGTH_MIN,
  DEFAULT_CYCLE_LENGTH,
  DEFAULT_CYCLE_STATE,
  DEFAULT_LOCK_TIMEOUT,
  DEFAULT_PERIOD_LENGTH,
  DEFAULT_REMINDER_DAYS_BEFORE,
  DEFAULT_REMINDER_TIME,
  LOCK_TIMEOUTS,
  MAX_PERIODS,
  MAX_PERIOD_AGE_YEARS,
  PERIOD_LENGTH_MAX,
  PERIOD_LENGTH_MIN,
  RAW_PERIOD_CAP,
  REMINDER_DAYS_BEFORE_MAX,
  REMINDER_DAYS_BEFORE_MIN,
  TIME_PATTERN,
  comparePeriods,
  makePeriod,
  periodSpanFailure,
  periodsOverlap,
  type CycleState,
  type Period,
} from "./cycle-model";
import { parseJson } from "./json";
import { dateKey } from "./planner";

/** The device's local calendar date; the default for the limits below. */
const localToday = (): string => dateKey(new Date());

// Every field carries its own default through `.catch`, so one bad value never rejects its siblings or its group.
const flag = (fallback: boolean) => z.boolean().catch(fallback);
const wholeNumber = (min: number, max: number, fallback: number) => z.number().int().min(min).max(max).catch(fallback);
const timeOfDay = (fallback: string) => z.string().regex(TIME_PATTERN).catch(fallback);
const lockTimeout = z
  .custom<number>(value => typeof value === "number" && (LOCK_TIMEOUTS as readonly number[]).includes(value))
  .catch(DEFAULT_LOCK_TIMEOUT);
const dateKeyString = z.string().refine(isDateKey);

const periodSchema = z.object({ start: dateKeyString, end: dateKeyString.optional() });

/**
 * One bad entry never rejects its siblings; bad spans, duplicates and overlaps are dropped; the newest 240 stay.
 * Like `validatePeriod`, a start after `today` or more than 10 years back is refused, so a crafted file cannot plant
 * future periods that would later block real logging with "overlap".
 */
function cleanPeriods(items: unknown[], today: string): Period[] {
  const oldest = yearsAgo(today, MAX_PERIOD_AGE_YEARS);
  const valid: Period[] = [];
  for (const item of items.slice(-RAW_PERIOD_CAP)) {
    const parsed = periodSchema.safeParse(item);
    if (!parsed.success || periodSpanFailure(parsed.data) !== null) continue;
    if (parsed.data.start > today || parsed.data.start < oldest) continue;
    valid.push(makePeriod(parsed.data));
  }
  const kept: Period[] = [];
  for (const period of valid.sort(comparePeriods)) {
    const last = kept.at(-1);
    if (last === undefined || !periodsOverlap(last, period)) kept.push(period);
  }
  return kept.slice(-MAX_PERIODS);
}

const defaultsSchema = z.object({
  cycleLength: wholeNumber(CYCLE_LENGTH_MIN, CYCLE_LENGTH_MAX, DEFAULT_CYCLE_LENGTH),
  periodLength: wholeNumber(PERIOD_LENGTH_MIN, PERIOD_LENGTH_MAX, DEFAULT_PERIOD_LENGTH),
});
const remindersSchema = z.object({
  daysBefore: wholeNumber(REMINDER_DAYS_BEFORE_MIN, REMINDER_DAYS_BEFORE_MAX, DEFAULT_REMINDER_DAYS_BEFORE),
  time: timeOfDay(DEFAULT_REMINDER_TIME),
  notifyLate: flag(true),
  notifyFertile: flag(false),
  neutralText: flag(true),
});
const lockSchema = z.object({ enabled: flag(true), timeoutSec: lockTimeout });

/** A group that is missing or not an object resolves to the group's own defaults. */
const group = <S extends z.ZodType>(schema: S): z.ZodCatch<S> =>
  schema.catch(() => (schema as z.ZodType).parse({}) as z.output<S>);

/** Field order here is the canonical JSON order. `today` is read at parse time, so a long-lived app never goes stale. */
function buildCycleStateSchema(today: () => string) {
  return z
    .object({
      enabled: flag(false),
      acknowledged: flag(false),
      paused: flag(false),
      periods: z.array(z.unknown()).catch([]).transform(items => cleanPeriods(items, today())),
      defaults: group(defaultsSchema),
      reminders: group(remindersSchema),
      lock: group(lockSchema),
      showOnTimeline: flag(false),
    })
    .catch(() => DEFAULT_CYCLE_STATE);
}

export const cycleStateSchema = buildCycleStateSchema(localToday);

/**
 * Never throws: anything unusable resolves to the defaults, field by field. `today` (local `YYYY-MM-DD`, default the
 * device's date) bounds the periods: none after it, none more than 10 years before it.
 */
export function parseCycleState(raw: unknown, today?: string): CycleState {
  const schema = today === undefined ? cycleStateSchema : buildCycleStateSchema(() => today);
  return schema.parse(raw);
}

export type ParsedCycle = {
  /** False when the text is not a JSON object (the state is then the defaults). */
  valid: boolean;
  /** True when anything stored had to be repaired, reordered or dropped, so a copy of the original is worth keeping. */
  lossy: boolean;
  state: CycleState;
};

export function parseCycleText(text: string, today?: string): ParsedCycle {
  const json = parseJson(text);
  if (!json.ok || typeof json.value !== "object" || json.value === null || Array.isArray(json.value)) {
    return { valid: false, lossy: false, state: DEFAULT_CYCLE_STATE };
  }
  const state = parseCycleState(json.value, today);
  return { valid: true, lossy: JSON.stringify(state) !== JSON.stringify(json.value), state };
}
