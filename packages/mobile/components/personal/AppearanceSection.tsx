import React from "react";
import { View } from "react-native";
import { ThemeSwitch } from "../settings/ThemeSwitch";
import { AccentPicker } from "./AccentPicker";

/** Theme (system / light / dark) and accent colour: the body of the Appearance page. */
export function AppearanceSection() {
  return <View>
    <ThemeSwitch />
    <AccentPicker />
  </View>;
}
