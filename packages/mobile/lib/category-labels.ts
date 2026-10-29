import { MAX_CUSTOM, MAX_NAME_LENGTH, type ColorSlot, type IconKey } from "./categories";

/** English labels (also translation keys) for the color slots. "Violet" already exists in lib/i18n/personal.ts. */
export const COLOR_LABELS: Record<ColorSlot, string> = {
  violet: "Violet", sky: "Sky", mint: "Mint", lime: "Lime", amber: "Amber", coral: "Coral", magenta: "Magenta", slate: "Slate",
};

/** English names (also translation keys) for the icons, for screen readers. */
export const ICON_LABELS: Record<IconKey, string> = {
  "star-outline": "Star", "book-outline": "Book", "cart-outline": "Cart", "home-outline": "Home",
  "musical-notes-outline": "Music", "barbell-outline": "Fitness", "school-outline": "School", "cafe-outline": "Coffee",
  "airplane-outline": "Travel", "game-controller-outline": "Games", "paw-outline": "Pet", "wallet-outline": "Wallet",
  "camera-outline": "Camera", "leaf-outline": "Leaf", "pricetag-outline": "Tag", "heart-outline": "Heart",
};

export type FailureMessage = { key: string; values?: Record<string, string> };

const GENERIC_FAILURE = "Could not save the category. Please try again.";

/** Translation key (plus placeholder values) for a category action failure or a name-check reason. */
export function failureMessage(reason: string): FailureMessage {
  switch (reason) {
    case "empty": return { key: "Enter a name" };
    case "too-long": return { key: "Use at most {count} characters", values: { count: String(MAX_NAME_LENGTH) } };
    case "duplicate": return { key: "A category with this name already exists" };
    case "limit": return { key: "You can add up to {count} categories", values: { count: String(MAX_CUSTOM) } };
    case "last-visible": return { key: "At least one category must stay visible" };
    case "locked": return { key: "Categories are read-only because the saved data could not be read safely." };
    default: return { key: GENERIC_FAILURE };
  }
}

