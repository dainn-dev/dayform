import { useSyncExternalStore } from "react";
import * as Font from "expo-font";
import { FONT_FILES } from "../constants/fonts";

/**
 * Loads the app's fonts once (from the bundle, so it also works after an over-the-air update). Until they are ready, or
 * if loading fails, the theme uses the system font at the same weights (lib/design-theme.ts `fontFace`), so text is
 * never invisible and a failure only changes the typeface.
 */
type State = "loading" | "ready" | "failed";
let state: State = "loading";
let started = false;
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  for (const listener of listeners) listener();
}

export function loadAppFonts(): void {
  if (started) return;
  started = true;
  Font.loadAsync(FONT_FILES).then(() => set("ready"), () => set("failed"));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** "ready" once the fonts are usable; "failed" means the system font stays. */
export function useAppFontsState(): State {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export function useFontsReady(): boolean {
  return useAppFontsState() === "ready";
}
