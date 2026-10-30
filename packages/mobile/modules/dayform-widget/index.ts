import { requireOptionalNativeModule } from "expo";
import { Platform } from "react-native";

type DayformWidgetNative = {
  setSnapshot(json: string): Promise<boolean>;
  setBackground(uri: string): Promise<boolean>;
  clearBackground(): Promise<boolean>;
  setBackgroundVeil(percent: number): Promise<boolean>;
  /** `[1 when a picture is set else 0, veil in percent]`. */
  getBackground(): number[];
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

/** The widget's custom background picture: whether one is set and how much white veil covers it (percent). */
export type WidgetBackgroundState = { hasPicture: boolean; veil: number };

export const DEFAULT_BACKGROUND_VEIL = 60;
export const MAX_BACKGROUND_VEIL = 90;

export function getWidgetBackground(): WidgetBackgroundState {
  if (native === null) return { hasPicture: false, veil: DEFAULT_BACKGROUND_VEIL };
  try {
    const [has, veil] = native.getBackground();
    return { hasPicture: has === 1, veil: typeof veil === "number" ? veil : DEFAULT_BACKGROUND_VEIL };
  } catch {
    return { hasPicture: false, veil: DEFAULT_BACKGROUND_VEIL };
  }
}

/** Copies the picture at `uri` (shrunk, in the app's private files) behind the widget card. Resolves false on any failure. */
export async function setWidgetBackground(uri: string): Promise<boolean> {
  if (native === null) return false;
  try {
    return (await native.setBackground(uri)) === true;
  } catch {
    return false;
  }
}

/** Removes the picture so the widget shows its plain card again. */
export async function clearWidgetBackground(): Promise<boolean> {
  if (native === null) return false;
  try {
    return (await native.clearBackground()) === true;
  } catch {
    return false;
  }
}

export async function setWidgetBackgroundVeil(percent: number): Promise<boolean> {
  if (native === null) return false;
  try {
    return (await native.setBackgroundVeil(Math.round(Math.min(MAX_BACKGROUND_VEIL, Math.max(0, percent))))) === true;
  } catch {
    return false;
  }
}
