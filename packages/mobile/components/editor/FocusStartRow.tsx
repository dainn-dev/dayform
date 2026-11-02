import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { focusMinutesFor } from "../../lib/focus";
import { useFocus } from "../../lib/focus-context";
import { useLanguage } from "../../lib/language";

type Props = { taskId: string; onStart: () => void };

/** Lets the editor finish closing before the focus sheet opens, so two modals never animate at once. */
const SHEET_DELAY_MS = 350;

/** Opens the focus timer for this task (the editor closes first). Shows the focus time already spent on it. */
export function FocusStartRow({ taskId, onStart }: Props) {
  const { t, duration } = useLanguage();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const { openSheet, log } = useFocus();
  const spent = focusMinutesFor(log, taskId);
  return <Pressable onPress={() => { onStart(); setTimeout(() => openSheet(taskId), SHEET_DELAY_MS); }} accessibilityRole="button" style={s.row}>
    <Text style={s.text}>{t("Focus on this task")}</Text>
    {spent > 0 && <Text style={s.spent}>{duration(spent)}</Text>}
  </Pressable>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  row: { marginTop: 19, minHeight: 48, borderRadius: 15, backgroundColor: c.primarySoft, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 },
  text: { flex: 1, color: c.accentForeground, fontSize: 14, fontWeight: "800" },
  spent: { color: c.mutedForeground, fontSize: 12, fontWeight: "700" },
});
