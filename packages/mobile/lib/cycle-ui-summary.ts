import type { CycleState } from "./cycle-model";
import type { Prediction, SafeDays, SafeDaysReason } from "./cycle-predict";
import { fill, tx, type Fill, type Translate } from "./cycle-ui-text";

/** Formats a `YYYY-MM-DD` key for display (the component supplies the locale). */
export type FormatDate = (key: string) => string;

export type SummaryTone = "next" | "late" | "idle";
export type SummaryView = { tone: SummaryTone; headline: Fill; detail: Fill | null };

const idle = (headline: string, detail: string | null): SummaryView => ({
  tone: "idle", headline: fill(headline), detail: detail === null ? null : fill(detail),
});

function lateView(prediction: Prediction, formatDate: FormatDate): SummaryView {
  const count = String(prediction.daysLate);
  return {
    tone: "late",
    headline: fill(prediction.daysLate === 1 ? tx("{count} day late") : tx("{count} days late"), { count }),
    detail: fill(tx("Expected {date}. Log your period when it starts and estimates will resume."), {
      date: formatDate(prediction.nextStart ?? ""),
    }),
  };
}

function nextHeadline(prediction: Prediction, formatDate: FormatDate): Fill {
  if (prediction.daysUntilNext === 0) return fill(tx("Next period expected today"));
  if (prediction.daysUntilNext === 1) return fill(tx("Next period expected tomorrow"));
  return fill(tx("Next period expected {date}"), { date: formatDate(prediction.nextStart ?? "") });
}

/** The summary card: what is expected next, or a plain sentence for why nothing is. */
export function summaryOf(prediction: Prediction, state: CycleState, formatDate: FormatDate): SummaryView {
  if (!state.enabled) return idle(tx("Tracking is off"), null);
  if (state.paused) return idle(tx("Tracking is paused"), tx("Nothing is predicted while tracking is paused."));
  if (prediction.lastStart === null) {
    return idle(tx("Not enough data yet"), tx("Log the day your last period started to see an estimate."));
  }
  if (prediction.nextStart === null) {
    return idle(tx("Not enough data yet"), tx("It has been a long time since your last logged period. Log a new one to restart estimates."));
  }
  if (prediction.late) return lateView(prediction, formatDate);
  return {
    tone: "next",
    headline: nextHeadline(prediction, formatDate),
    detail: fill(tx("Most likely between {from} and {to}"), {
      from: formatDate(prediction.nextRangeEarliest ?? ""), to: formatDate(prediction.nextRangeLatest ?? ""),
    }),
  };
}

const REASON_SENTENCE: Readonly<Record<SafeDaysReason, string>> = {
  "ok": tx("Lower-risk days are not available right now."),
  "not-enough-cycles": tx("Lower-risk days are shown only with enough regular data. Keep logging each period and they may appear here."),
  "irregular": tx("Your logged cycles vary too much for a calendar estimate, so no lower-risk days are shown."),
  "paused": tx("Tracking is paused, so no lower-risk days are shown."),
  "disabled": tx("Tracking is off, so no lower-risk days are shown."),
  "no-data": tx("Log the day your last period started to begin. Lower-risk days are shown only with enough regular data."),
  "late": tx("Your period is late, so no lower-risk days are shown until you log it."),
};

const METHOD_NAME = {
  "standard-days": tx("Standard Days method"),
  "ogino": tx("Ogino-Knaus (rhythm) method"),
} as const;

export type SafeDaysView =
  | { visible: false; reason: Fill }
  | { visible: true; method: Fill; fertileRange: Fill; others: Fill };

/** The "Lower-risk days (estimate)" block. It is visible only when the prediction produced a method; `t` translates the method name. */
export function safeDaysView(safe: SafeDays, formatDate: FormatDate, t: Translate): SafeDaysView {
  if (safe.kind === null || safe.fertile === null || safe.cycleDays === null) {
    return { visible: false, reason: fill(REASON_SENTENCE[safe.reason]) };
  }
  return {
    visible: true,
    method: fill(tx("Method: {method}"), { method: t(METHOD_NAME[safe.kind]) }),
    fertileRange: fill(tx("Fertile days this cycle: {from} to {to} (cycle days {first} to {last})"), {
      from: formatDate(safe.fertile.start), to: formatDate(safe.fertile.end),
      first: String(safe.cycleDays.first), last: String(safe.cycleDays.last),
    }),
    others: fill(tx("Other days of this cycle are marked lower-risk by the calendar estimate. This is not a guarantee.")),
  };
}
