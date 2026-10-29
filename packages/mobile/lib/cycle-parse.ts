import { z } from "zod";
import { isDateKey } from "./cycle-date";
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

// Every field carries its own default through `.catch`, so one bad value never rejects its siblings or its group.
const flag = (fallback: boolean) => z.boolean().catch(fallback);
const wholeNumber = (min: number, max: number, fallback: number) => z.number().int().min(min).max(max).catch(fallback);
const timeOfDay = (fallback: string) => z.string().regex(TIME_PATTERN).catch(fallback);
const lockTimeout = z
  .custom<number>(value => typeof value === "number" && (LOCK_TIMEOUTS as readonly number[]).includes(value))
  .catch(DEFAULT_LOCK_TIMEOUT);
const dateKeyString = z.string().refine(isDateKey);

const periodSchema = z.object({ start: dateKeyString, end: dateKeyString.optional() });

/** One bad entry never rejects its siblings; bad spans, duplicates and overlaps are dropped; the newest 240 stay. */
function cleanPeriods(items: unknown[]): Period[] {
  const valid: Period[] = [];
  for (const item of items.slice(-RAW_PERIOD_CAP)) {
    const parsed = periodSchema.safeParse(item);
    if (parsed.success && periodSpanFailure(parsed.data) === null) valid.push(makePeriod(parsed.data));
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

/** Field order here is the canonical JSON order. */
export const cycleStateSchema = z
  .object({
    enabled: flag(false),
    acknowledged: flag(false),
    paused: flag(false),
    periods: z.array(z.unknown()).catch([]).transform(cleanPeriods),
    defaults: group(defaultsSchema),
    reminders: group(remindersSchema),
    lock: group(lockSchema),
    showOnTimeline: flag(false),
  })
  .catch(() => DEFAULT_CYCLE_STATE);

/** Never throws: anything unusable resolves to the defaults, field by field. */
export function parseCycleState(raw: unknown): CycleState {
  return cycleStateSchema.parse(raw);
}

export type ParsedCycle = {
  /** False when the text is not a JSON object (the state is then the defaults). */
  valid: boolean;
  /** True when anything stored had to be repaired, reordered or dropped, so a copy of the original is worth keeping. */
  lossy: boolean;
  state: CycleState;
};

export function parseCycleText(text: string): ParsedCycle {
  const json = parseJson(text);
  if (!json.ok || typeof json.value !== "object" || json.value === null || Array.isArray(json.value)) {
    return { valid: false, lossy: false, state: DEFAULT_CYCLE_STATE };
  }
  const state = parseCycleState(json.value);
  return { valid: true, lossy: JSON.stringify(state) !== JSON.stringify(json.value), state };
}
