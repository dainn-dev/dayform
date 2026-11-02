import React, { createContext, useCallback, useContext, useMemo, useState } from "react";

export type QuickAddContextValue = {
  open: boolean;
  /** The text the sheet starts with (a text shared from another app); empty otherwise. */
  initialText: string;
  openQuickAdd: (text?: string) => void;
  closeQuickAdd: () => void;
};

const FALLBACK: QuickAddContextValue = { open: false, initialText: "", openQuickAdd: () => {}, closeQuickAdd: () => {} };
const QuickAddContext = createContext<QuickAddContextValue>(FALLBACK);

/** Holds whether the quick add sheet is open, so any screen (and a share from another app) can open it. */
export function QuickAddProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState({ open: false, initialText: "" });
  const openQuickAdd = useCallback((text = "") => setState({ open: true, initialText: text }), []);
  const closeQuickAdd = useCallback(() => setState({ open: false, initialText: "" }), []);
  const value = useMemo(() => ({ ...state, openQuickAdd, closeQuickAdd }), [state, openQuickAdd, closeQuickAdd]);
  return <QuickAddContext.Provider value={value}>{children}</QuickAddContext.Provider>;
}

/** Never throws: without a provider nothing opens. */
export function useQuickAdd(): QuickAddContextValue {
  return useContext(QuickAddContext);
}
