import { useEffect, useLayoutEffect, useRef } from "react";
import { AppState } from "react-native";
import { useLanguage } from "../lib/language";
import type { PetKind } from "../lib/settings";
import { useTasks } from "../lib/tasks-context";
import { createWidgetSyncer, type WidgetSyncInput, type WidgetSyncer } from "../lib/widget-syncer";
import { isWidgetSupported, setWidgetSnapshot } from "../modules/dayform-widget";

type WidgetSyncProps = {
  /** Show task titles on the widget; false shows only times and durations. */
  showTitles?: boolean;
  /** The pet drawn on the widget and whether it strolls (see the Pet settings page). */
  pet?: PetKind;
  petWalks?: boolean;
};

/**
 * Keeps the Android home-screen widget in line with the tasks. Renders nothing. It never sends while
 * the tasks are loading or writes are blocked (the list is then empty or partial). Does nothing on
 * platforms or builds without the native widget module.
 */
export function WidgetSync({ showTitles = true, pet = "round-cat", petWalks = true }: WidgetSyncProps): null {
  const { tasks, loading, writesBlocked } = useTasks();
  const { language } = useLanguage();
  const canSync = !loading && !writesBlocked;
  const latest = useRef<WidgetSyncInput>({ tasks, showTitles, locale: language, pet, petWalks, canSync });
  const syncer = useRef<WidgetSyncer | null>(null);

  useLayoutEffect(() => {
    latest.current = { tasks, showTitles, locale: language, pet, petWalks, canSync };
  }, [tasks, showTitles, language, pet, petWalks, canSync]);

  // Mount-only: the syncer and the foreground subscription stay stable across task changes.
  useEffect(() => {
    if (!isWidgetSupported()) return undefined;
    const created = createWidgetSyncer({ read: () => latest.current, send: setWidgetSnapshot });
    syncer.current = created;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") created.schedule({ force: true });
    });
    return () => {
      subscription.remove();
      created.dispose();
      syncer.current = null;
    };
  }, []);

  useEffect(() => {
    if (canSync) syncer.current?.schedule();
  }, [tasks, showTitles, language, pet, petWalks, canSync]);

  return null;
}
