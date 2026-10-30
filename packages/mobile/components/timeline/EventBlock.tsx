import React, { useMemo, useState } from "react";
import { AccessibilityInfo, Pressable, StyleSheet, Text, View, type AccessibilityActionEvent, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import { useCategoryColors } from "../../hooks/use-category-colors";
import { useBlockDrag } from "../../hooks/use-block-drag";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import type { Task } from "../../lib/planner";
import { formatMinutes, SNAP_MINUTES } from "../../lib/timeline-gestures";
import { useTimelineConfig } from "../../hooks/use-timeline-config";
import { compactMeta, eventDensity, showCompactIcon } from "../../lib/event-density";
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
  // The block's real width decides how much text a one-row block can show (lanes make it narrower).
  const [blockWidth, setBlockWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setBlockWidth(Math.round(event.nativeEvent.layout.width));
  const shown = drag.shown;
  const { top, height } = eventGeometry(config, shown);
  const color = categoryColors.get(task.category);
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

  const density = eventDensity(height);
  const strike = done ? s.strike : null;
  const startText = time(shown.start!);
  // A short block is ONE row (its height only fits one): the icon, the title and as much of the time as the width allows.
  const compactText = density === "compact" ? compactMeta(blockWidth, [`${startText} · ${duration(shown.duration)}`, startText]) : null;

  return <>
    <View {...drag.body} onLayout={onLayout} style={[s.wrapper, { top, height, ...place }, lifted && s.liftedWrapper]}>
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
        style={[s.event, density === "compact" && s.eventCompact, density === "medium" && s.eventMedium,
          { backgroundColor: color.bg, borderLeftColor: color.accent, opacity: done ? 0.62 : lifted ? 0.94 : 1 }, lifted && s.liftedEvent]}
      >
        {density === "compact" ? <View style={s.compactRow}>
          {showCompactIcon(blockWidth) && <Ionicons name={color.icon} size={13} color={color.accent} />}
          <Text numberOfLines={1} style={[s.compactTitle, strike]}>{task.title}</Text>
          {conflict && <Text accessible={false} style={s.compactOverlap}>⚠</Text>}
          {compactText !== null && <Text numberOfLines={1} style={s.compactMeta}>{compactText}</Text>}
        </View> : <>
          <View style={s.eventTop}>
            <Text numberOfLines={1} style={[s.eventTitle, density === "medium" && s.eventTitleMedium, strike]}>{task.title}</Text>
            {density === "full" && <Ionicons name={color.icon} size={18} color={color.accent} />}
          </View>
          <Text numberOfLines={1} style={[s.eventMeta, density === "medium" && s.eventMetaMedium]}>{startText} · {duration(shown.duration)}</Text>
          {conflict && height > 75 && <Text style={s.overlap}>{tr("⚠ Overlap")}</Text>}
        </>}
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
  // 30 minutes or less: 38 px tall, one centred row, tighter corners and padding so nothing is clipped.
  eventCompact: { justifyContent: "center", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 11 },
  // 46-63 px: two lines, but with the padding trimmed so the time line is not cut off.
  eventMedium: { paddingVertical: 6 },
  liftedEvent: { elevation: 10 },
  strike: { textDecorationLine: "line-through" },
  compactRow: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  compactTitle: { flex: 1, minWidth: 0, color: c.foreground, fontSize: 12.5, fontWeight: "800" },
  compactMeta: { flexShrink: 0, color: c.eventMeta, fontSize: 10.5, fontWeight: "600" },
  compactOverlap: { flexShrink: 0, color: c.overlapText, fontSize: 11, fontWeight: "800" },
  eventTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 4 },
  eventTitle: { flex: 1, color: c.foreground, fontSize: 14, fontWeight: "800" },
  eventTitleMedium: { fontSize: 13 },
  eventMeta: { marginTop: 4, color: c.eventMeta, fontSize: 10, fontWeight: "600" },
  eventMetaMedium: { marginTop: 2 },
  overlap: { color: c.overlapText, fontSize: 10, marginTop: 6, fontWeight: "800" },
});
