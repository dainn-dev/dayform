// Pure layout math for the app shell (tab bar, floating action button, undo snackbar).
// Kept free of React Native so it can be unit-tested.

/** Tab bar height without the system navigation inset (icon + label + padding). */
export const TAB_BAR_BASE_HEIGHT = 58;
/** Top padding inside the tab bar. */
export const TAB_BAR_PADDING_TOP = 7;

/** The floating "new task" button on the Timeline and Tasks screens. */
export const FAB_SIZE = 57;
export const FAB_MARGIN = 18;
/** Breathing room between the FAB row and a snackbar above it. */
export const FAB_GAP = 12;

/** How long the undo snackbar stays; longer when a screen reader needs time to find it. */
export const UNDO_TIMEOUT_MS = 6000;
export const UNDO_TIMEOUT_SCREEN_READER_MS = 15000;

function safeInset(inset: number): number {
  return Number.isFinite(inset) && inset > 0 ? inset : 0;
}

/** Full tab bar height: the base plus the bottom system inset (gesture bar ~24dp, 3-button nav ~48dp). */
export function tabBarHeight(insetBottom: number): number {
  return TAB_BAR_BASE_HEIGHT + safeInset(insetBottom);
}

/** `bottom` offset (from the window edge) that puts a snackbar above the tab bar and the FAB row. */
export function undoBarBottom(insetBottom: number): number {
  return tabBarHeight(insetBottom) + FAB_MARGIN + FAB_SIZE + FAB_GAP;
}

export function undoTimeout(screenReaderEnabled: boolean): number {
  return screenReaderEnabled ? UNDO_TIMEOUT_SCREEN_READER_MS : UNDO_TIMEOUT_MS;
}
