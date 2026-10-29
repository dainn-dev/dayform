import React from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "../hooks/use-colors";
import { CycleContent } from "../components/cycle/CycleContent";
import { CycleLockGate } from "../components/cycle/CycleLockGate";

/**
 * The private cycle tracker: a root route beside `(tabs)`, opened with `router.push("/cycle")` from the Personal
 * card. It is not a tab. The lock gate decides whether the content is rendered at all.
 */
export default function CycleScreen() {
  const colors = useColors();
  return <SafeAreaView edges={["top", "left", "right", "bottom"]} style={[styles.root, { backgroundColor: colors.background }]}>
    <CycleLockGate>
      <CycleContent />
    </CycleLockGate>
  </SafeAreaView>;
}

const styles = StyleSheet.create({ root: { flex: 1 } });
