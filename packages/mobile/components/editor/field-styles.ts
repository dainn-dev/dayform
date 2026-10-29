import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";

const makeFieldStyles = (c: ThemeColors) => StyleSheet.create({
  label: { color: c.labelText, fontSize: 10, fontWeight: "800", letterSpacing: 1.4, marginBottom: 9, marginTop: 19 },
  input: { minHeight: 52, backgroundColor: c.card, borderRadius: 15, paddingHorizontal: 16, paddingVertical: 14, color: c.foreground, fontSize: 15, borderWidth: 1, borderColor: c.inputBorder },
  row: { flexDirection: "row", gap: 12 },
});

/** Label / input / row styles shared by every editor field. */
export function useFieldStyles() {
  const colors = useColors();
  return useMemo(() => makeFieldStyles(colors), [colors]);
}
