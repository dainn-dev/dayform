import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

type DayformWidgetNative = {
  setSnapshot(json: string): Promise<boolean>;
};

/** Null on web, iOS, Expo Go and any build that does not contain the Android module. */
const native: DayformWidgetNative | null =
  Platform.OS === "android" ? requireOptionalNativeModule<DayformWidgetNative>("DayformWidget") : null;

/** True when the Android home-screen widget module is linked into this build. */
export function isWidgetSupported(): boolean {
  return native !== null;
}

/**
 * Stores the snapshot for the home-screen widget and refreshes every placed widget.
 * Resolves false (never rejects) when the module is missing or the native call fails.
 */
export async function setWidgetSnapshot(json: string): Promise<boolean> {
  if (native === null) return false;
  try {
    return (await native.setSnapshot(json)) === true;
  } catch {
    return false;
  }
}
