import { StyleSheet } from "react-native";
import { useThemedStyles, type Theme } from "../../hooks/use-theme";

/** Fixed field height: the status segment beside the duration field matches it. */
export const FIELD_HEIGHT = 52;

const makeFieldStyles = (t: Theme) => StyleSheet.create({
  label: { ...t.type.micro, color: t.colors.labelText, marginBottom: 9, marginTop: 19 },
  input: {
    ...t.type.body, minHeight: FIELD_HEIGHT, backgroundColor: t.colors.card, borderRadius: t.radius.md, paddingHorizontal: t.space.lg, paddingVertical: 14,
    color: t.colors.foreground, borderWidth: 1, borderColor: t.colors.inputBorder,
  },
  row: { flexDirection: "row", gap: t.space.md },
});

/** Label / input / row styles shared by every editor field. */
export function useFieldStyles() {
  return useThemedStyles(makeFieldStyles);
}
