import React, { useMemo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { CategoryColors } from "../../hooks/use-category-colors";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { useLanguage } from "../../lib/language";
import { fillPlaceholders } from "../../lib/text-template";
import { CategoryBadge } from "./CategoryBadge";

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
  onEdit: () => void;
  onToggleHidden: () => void;
  onDelete: () => void;
  /** Inline confirmation shown under the buttons. */
  children?: ReactNode;
};

/** "No tasks", "1 task" or "3 tasks", translated. */
export function useTaskCountText(): (count: number) => string {
  const { t } = useLanguage();
  return count => (count === 0 ? t("No tasks") : count === 1 ? t("1 task") : fillPlaceholders(t("{count} tasks"), { count: String(count) }));
}

/** One category: colored chip, name, "Hidden" badge, task count, and Edit / Hide-Show / Delete buttons. */
export function CategoryRow({ label, colors, taskCount, hidden, builtin, lastVisible, disabled, onEdit, onToggleHidden, onDelete, children }: Props) {
  const { t } = useLanguage();
  const palette = useColors();
  const s = useMemo(() => makeStyles(palette), [palette]);
  const countText = useTaskCountText()(taskCount);
  const summary = fillPlaceholders(t(hidden ? "{name}, {tasks}, hidden" : "{name}, {tasks}"), { name: label, tasks: countText });
  const hideBlocked = !hidden && lastVisible;
  const deleteBlocked = lastVisible;
  const toggleLabel = fillPlaceholders(t(hidden ? "Show {category}" : "Hide {category}"), { category: label });
  const hint = t("At least one category must stay visible");

  return <View style={s.row}>
    <View style={s.top}>
      <CategoryBadge colors={colors} />
      <View style={s.texts} accessible accessibilityLabel={summary}>
        <View style={s.nameLine}>
          <Text style={[s.name, hidden && s.dim]} numberOfLines={1}>{label}</Text>
          {hidden && <View style={s.badge}><Text style={s.badgeText}>{t("Hidden")}</Text></View>}
        </View>
        <Text style={s.meta}>{countText}</Text>
      </View>
    </View>
    <View style={s.actions}>
      <Action label={t("Edit")} a11y={fillPlaceholders(t("Edit {category}"), { category: label })} disabled={disabled} onPress={onEdit} styles={s} />
      <Action label={t(hidden ? "Show" : "Hide")} a11y={toggleLabel} disabled={disabled || hideBlocked} hint={hideBlocked ? hint : undefined}
        onPress={onToggleHidden} styles={s} />
      {!builtin && <Action label={t("Delete")} a11y={fillPlaceholders(t("Delete {category}"), { category: label })}
        disabled={disabled || deleteBlocked} hint={deleteBlocked ? hint : undefined} onPress={onDelete} styles={s} danger />}
    </View>
    {lastVisible && <Text style={s.hint}>{hint}</Text>}
    {children}
  </View>;
}

type ActionProps = {
  label: string; a11y: string; disabled: boolean; hint?: string; danger?: boolean; onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
};

function Action({ label, a11y, disabled, hint, danger, onPress, styles: s }: ActionProps) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y} accessibilityHint={hint}
    accessibilityState={{ disabled }} style={[s.action, disabled && s.disabled]}>
    <Text style={[s.actionText, danger && s.danger]}>{label}</Text>
  </Pressable>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline },
  top: { flexDirection: "row", alignItems: "center", gap: 12 },
  texts: { flex: 1 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flexShrink: 1, color: c.foreground, fontSize: 15, fontWeight: "700" },
  dim: { color: c.mutedForeground },
  badge: { backgroundColor: c.primaryTint, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { color: c.accentForeground, fontSize: 10, fontWeight: "800" },
  meta: { color: c.mutedForeground, fontSize: 12, marginTop: 2 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  action: { minHeight: 44, minWidth: 44, paddingHorizontal: 14, borderRadius: 13, backgroundColor: c.primaryTint, alignItems: "center", justifyContent: "center" },
  actionText: { color: c.accentForeground, fontSize: 12, fontWeight: "800" },
  danger: { color: c.errorMessage },
  disabled: { opacity: 0.45 },
  hint: { color: c.labelText, fontSize: 11, lineHeight: 16, marginTop: 6 },
});
