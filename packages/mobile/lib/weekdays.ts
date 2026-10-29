import { fromKey } from "./planner";

const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAYS_VI = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;

/** Short weekday name of a YYYY-MM-DD key ("Mon" / "T2"; Sunday is "CN" in Vietnamese). */
export function weekdayShort(key: string, language: string): string {
  const day = fromKey(key).getDay();
  return language === "vi" ? DAYS_VI[day] : DAYS_EN[day];
}
