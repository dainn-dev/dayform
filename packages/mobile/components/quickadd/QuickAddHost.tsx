import { useCallback, useEffect } from "react";
import { AppState } from "react-native";
import { useQuickAdd } from "../../lib/quick-add-context";
import { isWidgetSupported, takeSharedText } from "../../modules/dayform-widget";
import { QuickAddSheet } from "./QuickAddSheet";

/**
 * Mounted once in the root layout: the quick add sheet itself, and the pickup of text another app shared to Dayform
 * (read at start and whenever the app comes to the front) which opens the sheet with that text filled in.
 */
export function QuickAddHost() {
  const { open, initialText, openQuickAdd, closeQuickAdd } = useQuickAdd();

  const pickUp = useCallback(() => {
    if (!isWidgetSupported()) return;
    const text = takeSharedText();
    if (text !== null) openQuickAdd(text);
  }, [openQuickAdd]);

  useEffect(() => {
    pickUp();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") pickUp(); });
    return () => subscription.remove();
  }, [pickUp]);

  return <QuickAddSheet visible={open} initialText={initialText} onClose={closeQuickAdd} />;
}
