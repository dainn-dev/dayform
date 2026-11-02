import React, { createContext, useContext, useEffect, useRef, type ReactNode } from "react";

/** The small icon button a settings page part shows on the right of its card title, in line with it (e.g. "add"). */
export type HeaderAction = { label: string; disabled: boolean; onPress: () => void };

type Register = (action: HeaderAction | null) => void;

const RegisterContext = createContext<Register>(() => {});

export function HeaderActionProvider({ register, children }: { register: Register; children: ReactNode }) {
  return <RegisterContext.Provider value={register}>{children}</RegisterContext.Provider>;
}

/**
 * Asks the card the calling part sits in to show an "add" button beside its title while the part is mounted. `onPress`
 * may change on every render; the card only re-renders when the label or the disabled state change.
 */
export function useHeaderAction({ label, disabled, onPress }: HeaderAction): void {
  const register = useContext(RegisterContext);
  const latest = useRef(onPress);
  latest.current = onPress;
  useEffect(() => {
    register({ label, disabled, onPress: () => latest.current() });
    return () => register(null);
  }, [register, label, disabled]);
}
