import React from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useBackToPersonal } from "../hooks/use-back-to-personal";
import { useThemedStyles, type Theme } from "../hooks/use-theme";
import { CycleContent } from "../components/cycle/CycleContent";
import { CycleLockGate } from "../components/cycle/CycleLockGate";

/**
 * The private cycle tracker: a root route beside `(tabs)`, opened with `router.push("/cycle")` from the Personal
 * card. It is not a tab. The lock gate decides whether the content is rendered at all.
 */
export default function CycleScreen() {
  const s = useThemedStyles(makeStyles);
  useBackToPersonal();
  return <SafeAreaView edges={["top", "left", "right", "bottom"]} style={s.root}>
    <CycleLockGate>
      <CycleContent />
    </CycleLockGate>
  </SafeAreaView>;
}

const makeStyles = (t: Theme) => StyleSheet.create({ root: { flex: 1, backgroundColor: t.colors.background } });
