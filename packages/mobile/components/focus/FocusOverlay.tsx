import React from "react";
import { useFocus } from "../../lib/focus-context";
import { FocusMini } from "./FocusMini";
import { FocusNotifier } from "./FocusNotifier";
import { FocusSheet } from "./FocusSheet";

/** Mounted once in the root layout: the end-of-round notification, the pill above the tab bar and the full sheet (mounted only while open, so a closed sheet never ticks). */
export function FocusOverlay() {
  const { ready, sheet } = useFocus();
  if (!ready) return null;
  return <>
    <FocusNotifier />
    {!sheet.open && <FocusMini />}
    {sheet.open && <FocusSheet />}
  </>;
}
