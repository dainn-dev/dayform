import { createContext, useContext } from "react";

/** Called when a text input of the editor gains focus; the editor shell scrolls it above the keyboard. */
const RevealOnFocusContext = createContext<() => void>(() => {});

export const RevealOnFocusProvider = RevealOnFocusContext.Provider;

/** The `onFocus` handler for a TextInput inside the task editor (a no-op outside it). */
export function useRevealOnFocus(): () => void {
  return useContext(RevealOnFocusContext);
}
