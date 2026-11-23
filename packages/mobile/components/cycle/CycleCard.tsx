import React, { type ReactNode } from "react";
import { StyleSheet, Text } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";
import { Surface } from "../ui/Surface";

type Props = { title?: string; children: ReactNode };

/** A rounded surface of the cycle screen, with an optional small uppercase title. */
export function CycleCard({ title, children }: Props) {
  const s = useThemedStyles(makeStyles);
  return <Surface style={s.card}>
    {title ? <Text accessibilityRole="header" style={s.title}>{title}</Text> : null}
    {children}
  </Surface>;
}

const makeStyles = (t: Theme) => StyleSheet.create({
  card: { marginBottom: t.space.md },
  title: { ...t.type.micro, color: t.colors.labelText, marginBottom: t.space.md, textTransform: "uppercase" },
});
