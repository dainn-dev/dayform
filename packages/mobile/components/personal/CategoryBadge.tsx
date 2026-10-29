import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { CategoryColors } from "../../hooks/use-category-colors";

/** Colored icon chip of a category. Decorative: the row or control around it carries the accessible name. */
export function CategoryBadge({ colors, size = 40 }: { colors: CategoryColors; size?: number }) {
  return <View accessible={false} importantForAccessibility="no-hide-descendants"
    style={[styles.badge, { width: size, height: size, borderRadius: size * 0.32, backgroundColor: colors.bg }]}>
    <Ionicons name={colors.icon} size={Math.round(size * 0.5)} color={colors.accent} />
  </View>;
}

const styles = StyleSheet.create({
  badge: { alignItems: "center", justifyContent: "center" },
});
