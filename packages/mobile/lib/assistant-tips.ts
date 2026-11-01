import { dateKey, minutes, type Task } from "./planner";
import type { Line } from "./assistant-answers";

/**
 * Unprompted tips from the assistant (framework-free, tested). The idea is the one live2d-widget uses for its
 * `waifu-tips.json` (a line per place on the page), here per tab of the app plus the state of today's tasks. Everything
 * is worked out on the device; task titles are never used, only counts.
 */
export const TIP_ROUTES = ["timeline", "tasks", "stats", "personal"] as const;
export type TipRoute = (typeof TIP_ROUTES)[number];

/** At least this long between two tips, whatever triggers them. */
export const TIP_MIN_GAP_MS = 6 * 60_000;
/** A tab's tip shows once the user has been on it this long, so passing through a tab says nothing. */
export const ROUTE_TIP_DELAY_MS = 1500;
/** How often the assistant considers an idle tip. */
export const IDLE_TIP_CHECK_MS = 90_000;

/** The tab a pathname belongs to; null for any other screen (no tip there). */
export function routeOf(pathname: string): TipRoute | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/index") return "timeline";
  if (path === "/explore") return "tasks";
  if (path === "/stats") return "stats";
  if (path === "/personal") return "personal";
  return null;
}

export const ROUTE_TIPS: Readonly<Record<TipRoute, readonly Line[]>> = {
  timeline: [
    { text: "Drag a task block to move it, or drag its edge to change how long it takes." },
    { text: "Tasks that overlap sit side by side, so nothing hides behind another." },
  ],
  tasks: [
    { text: "Search ignores accents, so \"dang\" finds \"đăng\"." },
    { text: "Tasks without a day wait here until you plan them." },
  ],
  stats: [
    { text: "Here you see how much you finished this week and this month." },
  ],
  personal: [
    { text: "You can change my name and my voice on the Assistant page." },
  ],
};

/** Tips about the day itself, worked out from counts only. */
export function situationalTips(tasks: readonly Task[], now: Date): Line[] {
  const key = dateKey(now);
  const today = tasks.filter(task => task.date === key);
  const open = today.filter(task => task.status !== "done");
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const late = open.filter(task => task.start !== null && minutes(task.start) + task.duration <= nowMinutes);
  const hour = now.getHours();
  const tips: Line[] = [];

  if (today.length > 0 && open.length === 0) tips.push({ text: "Everything for today is done. Time to rest!" });
  if (today.length === 0 && hour >= 5 && hour < 20) tips.push({ text: "Nothing is planned today. Want to add one small thing?" });
  if (hour >= 5 && hour < 11 && open.length > 0) tips.push({ text: "Good morning! {n} tasks are waiting today.", vars: { n: open.length } });
  if (hour >= 20 && open.length > 0) tips.push({ text: "{n} tasks are still open tonight. Finish one, or plan them for tomorrow.", vars: { n: open.length } });
  if (late.length > 0) tips.push({ text: "{n} tasks are past their time and not done yet.", vars: { n: late.length } });
  return tips;
}

/**
 * Chooses the tip to show. Situational tips come first about half of the time; the line shown last time is skipped when
 * there is anything else. `random` is a number in [0, 1).
 */
export function pickTip(
  route: TipRoute | null,
  tasks: readonly Task[],
  now: Date,
  lastText: string | null,
  random: () => number,
  { routeOnly = false }: { routeOnly?: boolean } = {},
): Line | null {
  const situational = routeOnly ? [] : situationalTips(tasks, now);
  const general = route ? ROUTE_TIPS[route] : [];
  const pool = situational.length > 0 && (general.length === 0 || random() < 0.5) ? situational : general;
  if (pool.length === 0) return null;
  const fresh = pool.filter(line => line.text !== lastText);
  const choices = fresh.length > 0 ? fresh : pool;
  return choices[Math.min(choices.length - 1, Math.floor(random() * choices.length))];
}

/** Whether enough time has passed since the last tip. */
export function tipAllowed(lastTipAt: number | null, now: number): boolean {
  return lastTipAt === null || now - lastTipAt >= TIP_MIN_GAP_MS;
}
