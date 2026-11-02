import React, { useMemo, useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";

type Props = {
  title: string;
  /** A short line on the right of the title that stays visible while closed, e.g. "On" or "Off". */
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

const HEADER_HEIGHT = 48;
const ICON_SIZE = 18;

/** A heading that opens and closes the settings under it, so a long page can start short. The children are mounted only while open. */
export function Collapsible({ title, summary, defaultOpen = false, children }: Props) {
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const [open, setOpen] = useState(defaultOpen);
  return <View style={s.wrap}>
    <Pressable onPress={() => setOpen(current => !current)} accessibilityRole="button" accessibilityState={{ expanded: open }}
      accessibilityLabel={summary === undefined ? title : `${title}, ${summary}`} style={s.header}>
      <Text accessibilityRole="header" style={s.title}>{title}</Text>
      {summary !== undefined && <Text style={s.summary}>{summary}</Text>}
      <Ionicons name={open ? "chevron-up" : "chevron-down"} size={ICON_SIZE} color={colors.mutedForeground} />
    </Pressable>
    {open && <View style={s.body}>{children}</View>}
  </View>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  wrap: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.hairline },
  header: { minHeight: HEADER_HEIGHT, flexDirection: "row", alignItems: "center", gap: 8 },
  title: { flex: 1, color: c.foreground, fontSize: 14, fontWeight: "800" },
  summary: { color: c.mutedForeground, fontSize: 12, fontWeight: "700" },
  body: { paddingBottom: 4 },
});
