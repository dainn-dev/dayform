import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_CATEGORIES_STATE,
  categoryLabel,
  resolveCategory,
  visibleCategories,
  type CategoriesState,
  type NewCategoryInput,
  type ResolvedCategory,
} from "./categories";
import { createCategoriesStore, type CategoriesActionResult } from "./categories-store";
import { useLanguage } from "./language";

export type CategoriesContextValue = {
  state: CategoriesState;
  /** True once the stored categories were read (or the read failed and defaults apply). */
  ready: boolean;
  /** True while the latest attempt to save failed; the previous value still applies. */
  saveError: boolean;
  /** True when the stored value could not be read safely, so changes are refused this session. */
  locked: boolean;
  /** Ids a picker should offer: visible built-ins, then custom categories. */
  visible: string[];
  /** Display name for any id (translated only when it is a built-in default or the "Other" fallback). */
  label: (id: string) => string;
  /** Safe for unknown ids: they resolve to a fallback instead of throwing. */
  resolve: (id: string) => ResolvedCategory;
  add: (input: NewCategoryInput) => Promise<CategoriesActionResult>;
  update: (id: string, patch: Partial<NewCategoryInput>) => Promise<CategoriesActionResult>;
  remove: (id: string) => Promise<CategoriesActionResult>;
  hide: (id: string) => Promise<CategoriesActionResult>;
  show: (id: string) => Promise<CategoriesActionResult>;
  rename: (id: string, name: string) => Promise<CategoriesActionResult>;
  importState: (incoming: CategoriesState, mode: "merge" | "replace") => Promise<CategoriesActionResult>;
};

const identity = (text: string) => text;
const noChange = async (): Promise<CategoriesActionResult> => ({ ok: true });

function build(state: CategoriesState, translate: (text: string) => string): Pick<CategoriesContextValue, "visible" | "label" | "resolve"> {
  return {
    visible: visibleCategories(state),
    label: id => categoryLabel(id, state, translate),
    resolve: id => resolveCategory(id, state),
  };
}

/** Used outside a provider (error fallback, tests): the four built-ins, English names and actions that do nothing. */
const FALLBACK: CategoriesContextValue = {
  state: DEFAULT_CATEGORIES_STATE,
  ready: true,
  saveError: false,
  locked: false,
  ...build(DEFAULT_CATEGORIES_STATE, identity),
  add: noChange, update: noChange, remove: noChange, hide: noChange, show: noChange, rename: noChange, importState: noChange,
};

const CategoriesContext = createContext<CategoriesContextValue>(FALLBACK);

/** Mount below LanguageProvider (labels are translated with its `t`). */
export function CategoriesProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(() => createCategoriesStore(AsyncStorage));
  const { t } = useLanguage();

  useEffect(() => {
    void store.load();
    return () => store.dispose();
  }, [store]);

  const snapshot = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  // Duplicate checks also compare against the translated built-in names the user sees.
  const add = useCallback((input: NewCategoryInput) => store.add(input, { translate: t }), [store, t]);
  const update = useCallback(
    (id: string, patch: Partial<NewCategoryInput>) => store.update(id, patch, { translate: t }), [store, t],
  );
  const rename = useCallback((id: string, name: string) => store.rename(id, name, { translate: t }), [store, t]);

  const value = useMemo<CategoriesContextValue>(() => ({
    state: snapshot.state,
    ready: snapshot.ready,
    saveError: snapshot.saveError,
    locked: snapshot.locked,
    ...build(snapshot.state, t),
    add, update, rename,
    remove: store.remove, hide: store.hide, show: store.show, importState: store.importState,
  }), [snapshot, t, store, add, update, rename]);
  return <CategoriesContext.Provider value={value}>{children}</CategoriesContext.Provider>;
}

/** Never throws: without a provider it returns the built-in categories and no-op actions. */
export function useCategories(): CategoriesContextValue {
  return useContext(CategoriesContext);
}
