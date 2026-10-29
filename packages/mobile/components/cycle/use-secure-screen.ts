import { usePreventScreenCapture } from "expo-screen-capture";

const CAPTURE_KEY = "cycle";

/**
 * Keeps the cycle screen, and the lock screen shown in its place, out of screenshots, screen recordings and the
 * recent-apps thumbnail (Android FLAG_SECURE; on iOS capture is blocked while the screen is shown). Released when
 * the screen unmounts. Thin glue over expo-screen-capture, no decisions to test.
 */
export function useSecureScreen(): void {
  usePreventScreenCapture(CAPTURE_KEY);
}
