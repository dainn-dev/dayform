import type { Line } from "./assistant-answers";
import { word } from "./ladder-words";
import type { LadderStyle } from "./realm";
import type { SettleEvent } from "./xp";

/**
 * What the assistant says after the finished days were judged (framework-free, tested). A penalty beats a rest day; a
 * demotion beats a plain penalty. Only counts are said, never a task title. null means nothing worth saying.
 */
export type Notice = { line: Line; /** The assistant looks displeased (a penalty), not just informing. */ stern: boolean };

export function noticeFor(events: readonly SettleEvent[], style: LadderStyle = "cultivation"): Notice | null {
  const notice = baseNotice(events);
  return notice && { ...notice, line: { ...notice.line, text: word(style, notice.line.text) } };
}

function baseNotice(events: readonly SettleEvent[]): Notice | null {
  const penalties = events.filter((event): event is Extract<SettleEvent, { type: "penalty" }> => event.type === "penalty");
  if (penalties.length > 0) {
    const amount = penalties.reduce((sum, event) => sum + event.amount, 0);
    if (penalties.some(event => event.demoted)) {
      return { stern: true, line: { text: "Your cultivation was shaken: -{amount} experience, and you fell back a realm. Finish a task today to climb again!", vars: { amount } } };
    }
    if (amount === 0) {
      return { stern: true, line: { text: "A day without a finished task broke your streak. Finish one today!" } };
    }
    return penalties.length === 1
      ? { stern: true, line: { text: "A day without a finished task cost you {amount} experience. Finish one today!", vars: { amount } } }
      : { stern: true, line: { text: "{days} days without a finished task cost you {amount} experience. Finish one today!", vars: { days: penalties.length, amount } } };
  }
  const rests = events.filter(event => event.type === "rest").length;
  if (rests === 0) return null;
  return rests === 1
    ? { stern: false, line: { text: "Yesterday was a rest day. Your streak is safe." } }
    : { stern: false, line: { text: "{days} days were rest days. Your streak is safe.", vars: { days: rests } } };
}
