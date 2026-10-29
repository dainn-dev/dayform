import { useMemo } from "react";
import { useSettings } from "../lib/settings-context";
import { makeTimelineConfig, type TimelineConfig } from "../lib/timeline-config";

/** The timeline geometry for the user's Calendar settings, recomputed only when one of them changes. */
export function useTimelineConfig(): TimelineConfig {
  const { dayStart, dayEnd, hourHeight } = useSettings().settings.calendar;
  return useMemo(() => makeTimelineConfig({ dayStart, dayEnd, hourHeight }), [dayStart, dayEnd, hourHeight]);
}
