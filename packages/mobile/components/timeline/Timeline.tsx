import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { overlaps, type Task } from "../../lib/planner";
import { layoutLanes } from "../../lib/timeline-layout";
import { EventBlock } from "./EventBlock";
import { FIRST_HOUR, GUTTER, HOURS, MIN_VISUAL_MINUTES, SCALE, SLOT_HOURS, TIMELINE_HEIGHT } from "./constants";
import { hourLabel, nowOffset } from "./layout";
import type { TaskPatch } from "./drag-controller";

type Props = {
  /** Tasks starting inside the visible window (see `partitionVisible`). */
  visible: Task[];
  /** Every scheduled task of the day, used only for the empty state. */
  scheduledCount: number;
  /** The current time when the shown day is today (the now line), else null. */
  now: Date | null;
  onAddAt: (time: string) => void;
  onEdit: (task: Task) => void;
  /** Persist a dragged/resized block (this occurrence only); resolves false when saving failed. */
  onMove: (task: Task, patch: TaskPatch) => Promise<boolean>;
  /** True while a finger drags a block: the page ScrollView must not scroll. */
  onLockChange: (locked: boolean) => void;
};

/** Hour grid, tappable hour slots, now line, event layer and empty state for one day. */
export function Timeline({ visible, scheduledCount, now, onAddAt, onEdit, onMove, onLockChange }: Props) {
  const { t: tr } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const lanes = layoutLanes(visible, MIN_VISUAL_MINUTES);
  const nowY = now ? nowOffset(now) : null;

  return <View style={s.timeline}>
    {HOURS.map(hour => <View key={hour} style={[s.hour, { top: (hour - FIRST_HOUR) * 60 * SCALE }]}><Text style={s.hourLabel}>{hourLabel(hour)}</Text><View style={s.hourLine} /></View>)}
    {/* Touch-only: 16 empty TalkBack stops are noise; screen readers use the Add buttons. */}
    {SLOT_HOURS.map(hour => <Pressable key={hour} onPress={() => onAddAt(hourLabel(hour))} accessible={false} importantForAccessibility="no" style={[s.hourHit, { top: (hour - FIRST_HOUR) * 60 * SCALE }]} />)}
    {nowY !== null && <View pointerEvents="none" style={[s.nowLine, { top: nowY }]}><View style={s.nowCircle} /><View style={s.nowRule} /></View>}
    <View pointerEvents="box-none" style={s.eventLayer}>{visible.map(task => {
      const { lane, lanes: laneCount } = lanes[task.id];
      const conflict = visible.some(p => overlaps(task, p));
      return <EventBlock key={task.id} task={task} lane={lane} lanes={laneCount} conflict={conflict} onPress={() => onEdit(task)} onCommit={patch => onMove(task, patch)} onLockChange={onLockChange} />;
    })}</View>
    {!scheduledCount && <View pointerEvents="none" style={s.emptyTimeline}><Ionicons name="sparkles-outline" size={24} color={colors.emptyIcon} /><Text style={s.emptyTitle}>{tr("A little breathing room")}</Text><Text style={s.emptyText}>{tr("Tap any hour to plan something here.")}</Text></View>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  timeline: { height: TIMELINE_HEIGHT, marginLeft: 2, marginRight: 3, position: "relative" },
  hour: { position: "absolute", width: "100%", flexDirection: "row", alignItems: "center", height: 15, zIndex: 0 },
  hourLabel: { width: 46, fontSize: 10, fontWeight: "700", color: c.hourLabel },
  hourLine: { flex: 1, borderTopWidth: 1, borderTopColor: c.hairline },
  hourHit: { position: "absolute", left: GUTTER, right: 0, height: 59 * SCALE, zIndex: 1 },
  eventLayer: { position: "absolute", left: GUTTER, right: 0, top: 0, bottom: 0, zIndex: 3 },
  nowLine: { position: "absolute", zIndex: 4, left: 43, right: 0, flexDirection: "row", alignItems: "center" },
  nowCircle: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.nowLine },
  nowRule: { flex: 1, height: 1, backgroundColor: c.nowLine },
  emptyTimeline: { position: "absolute", top: 65, left: 56, right: 5, alignItems: "center", padding: 25, backgroundColor: c.emptyBg, borderRadius: 17 },
  emptyTitle: { color: c.foreground, fontSize: 14, fontWeight: "800", marginTop: 8 },
  emptyText: { color: c.mutedForeground, fontSize: 11, marginTop: 4 },
});
