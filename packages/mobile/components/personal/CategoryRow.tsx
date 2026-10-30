import React, { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { CategoryColors } from "../../hooks/use-category-colors";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { fillPlaceholders } from "../../lib/text-template";
import { CategoryBadge } from "./CategoryBadge";
import { SwipeActionRow } from "./SwipeActionRow";

/** Width of the delete action uncovered by swiping the row to the left. */
const DELETE_ACTION_WIDTH = 84;
const ICON_BUTTON = 36;
/** 36 px button + 4 px above and below = the 44 px minimum touch target (sideways it stays inside the gap). */
const ICON_HIT_SLOP = { top: 4, bottom: 4, left: 2, right: 2 } as const;

type Props = {
  label: string;
  colors: CategoryColors;
  taskCount: number;
  hidden: boolean;
  builtin: boolean;
  /** This is the only visible category: it can be neither hidden nor deleted. */
  lastVisible: boolean;
  /** Edits are refused (the stored categories could not be read safely) or an action is running. */
  disabled: boolean;
  /** Whether the delete action is uncovered (the parent keeps a single row open at a time). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
  /** Inline confirmation shown under the row. */
  children?: ReactNode;
};

/** "No tasks", "1 task" or "3 tasks", translated. */
export function useTaskCountText(): (count: number) => string {
  const { t } = useLanguage();
  return count => (count === 0 ? t("No tasks") : count === 1 ? t("1 task") : fillPlaceholders(t("{count} tasks"), { count: String(count) }));
}

/**
 * One category on a single line: colored chip, name (with a "Hidden" badge) and task count, then icon buttons to edit
 * and to hide or show it. A custom category can be deleted by swiping the row to the left (and through a TalkBack
 * action); the built-in ones can only be hidden.
 */
export function CategoryRow({ label, colors, taskCount, hidden, builtin, lastVisible, disabled, open, onOpenChange, onEdit, onToggleHidden, onDelete, children }: Props) {
  const { t } = useLanguage();
  const palette = useColors();
  const s = useMemo(() => makeStyles(palette), [palette]);
  const countText = useTaskCountText()(taskCount);
  const summary = fillPlaceholders(t(hidden ? "{name}, {tasks}, hidden" : "{name}, {tasks}"), { name: label, tasks: countText });
  const hideBlocked = !hidden && lastVisible;
  const deleteBlocked = lastVisible;
  const canDelete = !builtin && !deleteBlocked && !disabled;
  const toggleLabel = fillPlaceholders(t(hidden ? "Show {category}" : "Hide {category}"), { category: label });
  const deleteLabel = fillPlaceholders(t("Delete {category}"), { category: label });
  const hint = t("At least one category must stay visible");

  const requestDelete = () => { onOpenChange(false); onDelete(); };

  const deleteAction = <Pressable onPress={requestDelete} disabled={!canDelete} accessibilityRole="button" accessibilityLabel={deleteLabel} style={s.deleteAction}>
    <Ionicons name="trash-outline" size={20} color={palette.deleteText} />
    <Text style={s.deleteText}>{t("Delete")}</Text>
  </Pressable>;

  return <View style={s.row}>
    <SwipeActionRow enabled={canDelete} open={open} onOpenChange={onOpenChange} actionWidth={DELETE_ACTION_WIDTH} backgroundColor={palette.card} action={deleteAction}>
      <View style={s.line}>
        <CategoryBadge colors={colors} />
        <View style={s.texts} accessible accessibilityLabel={summary}
          accessibilityActions={canDelete ? [{ name: "delete", label: deleteLabel }] : undefined}
          onAccessibilityAction={event => { if (event.nativeEvent.actionName === "delete") requestDelete(); }}>
          <View style={s.nameLine}>
            <Text style={[s.name, hidden && s.dim]} numberOfLines={1}>{label}</Text>
            {hidden && <View style={s.badge}><Text style={s.badgeText}>{t("Hidden")}</Text></View>}
          </View>
          <Text style={s.meta}>{countText}</Text>
        </View>
        <IconButton icon="create-outline" a11y={fillPlaceholders(t("Edit {category}"), { category: label })} disabled={disabled} onPress={onEdit} styles={s} color={palette.accentForeground} />
        <IconButton icon={hidden ? "eye-outline" : "eye-off-outline"} a11y={toggleLabel} hint={hideBlocked ? hint : undefined}
          disabled={disabled || hideBlocked} onPress={onToggleHidden} styles={s} color={palette.accentForeground} />
      </View>
    </SwipeActionRow>
    {lastVisible && <Text style={s.hint}>{hint}</Text>}
    {children}
  </View>;
}

type IconButtonProps = {
  icon: "create-outline" | "eye-outline" | "eye-off-outline"; a11y: string; disabled: boolean; hint?: string; color: string;
  onPress: () => void; styles: ReturnType<typeof makeStyles>;
};

function IconButton({ icon, a11y, disabled, hint, color, onPress, styles: s }: IconButtonProps) {
  return <Pressable onPress={onPress} disabled={disabled} hitSlop={ICON_HIT_SLOP} accessibilityRole="button" accessibilityLabel={a11y}
    accessibilityHint={hint} accessibilityState={{ disabled }} style={[s.iconButton, disabled && s.disabled]}>
    <Ionicons name={icon} size={19} color={color} />
  </Pressable>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline },
  line: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  texts: { flex: 1 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flexShrink: 1, color: c.foreground, fontSize: 15, fontWeight: "700" },
  dim: { color: c.mutedForeground },
  badge: { backgroundColor: c.primaryTint, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: c.accentForeground, fontSize: 10, fontWeight: "800" },
  meta: { color: c.mutedForeground, fontSize: 12, marginTop: 1 },
  iconButton: { width: ICON_BUTTON, height: ICON_BUTTON, borderRadius: 12, backgroundColor: c.primaryTint, alignItems: "center", justifyContent: "center" },
  deleteAction: { flex: 1, backgroundColor: c.errorBg, alignItems: "center", justifyContent: "center", gap: 2 },
  deleteText: { color: c.errorMessage, fontSize: 11, fontWeight: "800" },
  disabled: { opacity: 0.45 },
  hint: { color: c.labelText, fontSize: 11, lineHeight: 16, marginTop: 2, marginBottom: 4 },
});
