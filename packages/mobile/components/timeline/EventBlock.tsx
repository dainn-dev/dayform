import React, { useMemo } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, type AccessibilityActionEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import { useCategoryColors } from "../../hooks/use-category-colors";
import { useBlockDrag } from "../../hooks/use-block-drag";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import type { Task } from "../../lib/planner";
import { formatMinutes, SNAP_MINUTES } from "../../lib/timeline-gestures";
import { useTimelineConfig } from "../../hooks/use-timeline-config";
import { eventGeometry } from "../../lib/timeline-config";
import { EdgeHandle } from "./EdgeHandle";
import type { TaskPatch } from "./drag-controller";

type Props = {
  task: Task;
  /** Zero-based lane within the overlap cluster, and the cluster's lane count. */
  lane: number;
  lanes: number;
  conflict: boolean;
  onPress: () => void;
  /** Persist a new time/length for this block; resolves false when saving failed. */
  onCommit: (patch: TaskPatch) => Promise<boolean>;
  /** True while a finger drags this block: the page must not scroll. */
  onLockChange?: (locked: boolean) => void;
};

const MOVE_EARLIER = "moveEarlier";
const MOVE_LATER = "moveLater";

/** One positioned task block on the timeline: tap to edit, long-press then drag to move or resize. */
export function EventBlock({ task, lane, lanes, conflict, onPress, onCommit, onLockChange }: Props) {
  const { t: tr, duration, time } = useLanguage();
  const colors = useColors();
  const categoryColors = useCategoryColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const config = useTimelineConfig();
  const drag = useBlockDrag({ task, onCommit, onPress, onLockChange });
  const shown = drag.shown;
  const { top, height } = eventGeometry(config, shown);
  const color = categoryColors[task.category];
  const width = 100 / lanes;
  const place = { left: `${lane * width}%` as const, width: `${width}%` as const };
  const done = task.status === "done";
  const lifted = drag.phase !== "idle";
  const label = `${task.title}${done ? `, ${tr("Completed")}` : ""}, ${time(shown.start!)}, ${duration(shown.duration)}${conflict ? `, ${tr("⚠ Overlaps another task")}` : ""}`;

  /** Move by one step and tell the screen reader what happened, including a refusal at the window limit. */
  const shiftAndAnnounce = async (delta: number) => {
    const result = await drag.shift(delta);
    if (result.kind === "moved") AccessibilityInfo.announceForAccessibility(`${tr("Moved to")} ${time(formatMinutes(result.start))}`);
    else if (result.kind === "limit") AccessibilityInfo.announceForAccessibility(tr(delta < 0 ? "Cannot move earlier" : "Cannot move later"));
  };
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === MOVE_EARLIER) void shiftAndAnnounce(-SNAP_MINUTES);
    if (event.nativeEvent.actionName === MOVE_LATER) void shiftAndAnnounce(SNAP_MINUTES);
  };

  return <>
    <View {...drag.body} style={[s.wrapper, { top, height, ...place }, lifted && s.liftedWrapper]}>
      <Pressable
        {...drag.pressable}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={tr("Hold and drag to move")}
        accessibilityActions={[
          { name: MOVE_EARLIER, label: tr("Move 15 minutes earlier") },
          { name: MOVE_LATER, label: tr("Move 15 minutes later") },
        ]}
        onAccessibilityAction={onAction}
        style={[s.event, { backgroundColor: color.bg, borderLeftColor: color.accent, opacity: done ? 0.62 : lifted ? 0.94 : 1 }, lifted && s.liftedEvent]}
      >
        <View style={s.eventTop}>
          <Text numberOfLines={1} style={[s.eventTitle, height < 55 && { fontSize: 12 }, done && { textDecorationLine: "line-through" }]}>{task.title}</Text>
          {height > 57 && <Ionicons name={color.icon} size={18} color={color.accent} />}
        </View>
        <Text numberOfLines={1} style={s.eventMeta}>{time(shown.start!)} · {duration(shown.duration)}</Text>
        {conflict && height > 75 && <Text style={s.overlap}>{tr("⚠ Overlap")}</Text>}
      </Pressable>
    </View>
    {lifted && <>
      <EdgeHandle edge="top" blockTop={top} blockHeight={height} containerHeight={config.height} place={place} handlers={drag.topHandle} label={tr("Drag the handle to change duration")} />
      <EdgeHandle edge="bottom" blockTop={top} blockHeight={height} containerHeight={config.height} place={place} handlers={drag.bottomHandle} label={tr("Drag the handle to change duration")} />
    </>}
  </>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  wrapper: { position: "absolute", zIndex: 3, minWidth: 0 },
  // Above sibling blocks while armed or dragging; the preview never re-lays out the others.
  liftedWrapper: { zIndex: 20, transform: [{ scale: 1.02 }], shadowColor: c.shadowPanel, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  event: { flex: 1, borderLeftWidth: 3, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 9, overflow: "hidden", minWidth: 0 },
  liftedEvent: { elevation: 10 },
  eventTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 4 },
  eventTitle: { flex: 1, color: c.foreground, fontSize: 14, fontWeight: "800" },
  eventMeta: { marginTop: 4, color: c.eventMeta, fontSize: 10, fontWeight: "600" },
  overlap: { color: c.overlapText, fontSize: 10, marginTop: 6, fontWeight: "800" },
});
