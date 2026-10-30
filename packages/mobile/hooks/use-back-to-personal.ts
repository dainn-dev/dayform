import { useEffect } from "react";
import { BackHandler } from "react-native";
import { router } from "expo-router";

/**
 * Where a settings page (and the cycle screen) goes back to: always the Personal tab. `router.back()` is wrong here:
 * the tab group is unmounted while a root route is open and comes back at its first tab (the Timeline), not at the
 * tab the user left from.
 */
export function leaveToPersonal(): void {
  router.replace("/(tabs)/personal");
}

/** Makes the phone's hardware / gesture Back do the same as the on-screen back button. */
export function useBackToPersonal(): void {
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      leaveToPersonal();
      return true;
    });
    return () => subscription.remove();
  }, []);
}
