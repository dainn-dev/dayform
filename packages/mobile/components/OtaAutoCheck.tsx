import { useEffect } from "react";
import { AppState } from "react-native";
import { OTA_IDLE_DELAY_MS } from "@/lib/ota";
import { useOta } from "@/lib/ota-context";
import { useSettings } from "@/lib/settings-context";
import { useTasks } from "@/lib/tasks-context";

/**
 * Starts the automatic content-update check a few seconds after the app is idle (tasks loaded, settings read) and a
 * few seconds after every return to the foreground. The checker applies the 12 h throttle, so this is cheap.
 * Does nothing when "Update app content automatically" is off. A downloaded update is never applied here: it takes
 * effect the next time the app starts. Renders nothing.
 */
export function OtaAutoCheck(): null {
  const { checkAuto } = useOta();
  const { loading } = useTasks();
  const { ready, settings } = useSettings();
  const enabled = settings.updates.autoOta;

  useEffect(() => {
    if (loading || !ready || !enabled) return undefined;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancel = (): void => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const schedule = (): void => {
      cancel();
      timer = setTimeout(() => { timer = null; void checkAuto(); }, OTA_IDLE_DELAY_MS);
    };
    schedule();
    const subscription = AppState.addEventListener("change", next => {
      if (next === "active") schedule();
      else cancel();
    });
    return () => {
      cancel();
      subscription.remove();
    };
  }, [loading, ready, enabled, checkAuto]);

  return null;
}
