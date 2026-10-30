import React from "react";
import { Redirect, useLocalSearchParams } from "expo-router";
import { SettingsPage } from "../../components/menu/SettingsPage";
import { findPage } from "../../lib/settings-menu";

/**
 * One Personal settings page: a root route beside `(tabs)` and `cycle`, opened with `router.push("/settings/<slug>")`
 * from the Personal menu or with the deep link `dayform://settings/<slug>`. The slugs are the pages of
 * lib/settings-menu.ts; anything else goes back to the menu.
 */
export default function SettingsScreen() {
  const { section } = useLocalSearchParams<{ section?: string | string[] }>();
  const row = findPage(section);
  if (row === null) return <Redirect href="/(tabs)/personal" />;
  return <SettingsPage row={row} />;
}
