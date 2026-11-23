import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { focusMinutesFor } from "../../lib/focus";
import { useFocus } from "../../lib/focus-context";
import { useLanguage } from "../../lib/language";

type Props = { taskId: string; onStart: () => void };

/** Lets the editor finish closing before the focus sheet opens, so two modals never animate at once. */
const SHEET_DELAY_MS = 350;

/** Opens the focus timer for this task (the editor closes first). Shows the focus time already spent on it. */
export function FocusStartRow({ taskId, onStart }: Props) {
  const { t, duration } = useLanguage();
  const s = useThemedStyles(makeStyles);
  const { openSheet, log } = useFocus();
  const spent = focusMinutesFor(log, taskId);
  return <Pressable onPress={() => { onStart(); setTimeout(() => openSheet(taskId), SHEET_DELAY_MS); }} accessibilityRole="button" style={s.row}>
    <Text style={s.text}>{t("Focus on this task")}</Text>
    {spent > 0 && <Text style={s.spent}>{duration(spent)}</Text>}
  </Pressable>;
}

const makeStyles = ({ colors: c, radius, space, type, font }: Theme) => StyleSheet.create({
  row: { marginTop: 19, minHeight: 48, borderRadius: radius.md, backgroundColor: c.primarySoft, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space.lg },
  text: { ...type.body, ...font.heavy, flex: 1, color: c.accentForeground },
  spent: { ...type.meta, ...font.bold, color: c.mutedForeground },
});
