/**
 * How a timeline task block lays out its text, decided from its pixel size. Pure so it can be tested: the component
 * only renders what these functions say.
 *
 * A task of 30 minutes or less is always `MIN_EVENT_PX` (38) tall at every timeline density, which fits ONE row of
 * text: with the old two-line layout (title + time line, 9 px padding) the second line was clipped.
 */
export type EventDensity = "compact" | "medium" | "full";

/** Below this height a block is a single row. */
export const COMPACT_MAX_HEIGHT = 46;
/** From this height a block has room for the icon, the title and the time line with the original padding. */
export const FULL_MIN_HEIGHT = 64;

export function eventDensity(height: number): EventDensity {
  if (height < COMPACT_MAX_HEIGHT) return "compact";
  return height < FULL_MIN_HEIGHT ? "medium" : "full";
}

// Rough text metrics for the 10.5 px meta text and the 12.5 px title: good enough to choose between a few variants.
const META_CHAR_PX = 5.8;
const META_GAP_PX = 8;
/** The title is kept at least this wide before any meta text is shown. */
export const MIN_TITLE_PX = 56;
const ROW_PADDING_PX = 16;
/** Width of the overlap warning mark (and its gap) when it shares the row. */
export const CONFLICT_MARK_PX = 17;

/**
 * The right-hand text of a compact row: the first variant that still leaves the title `MIN_TITLE_PX`, or null when
 * even the shortest does not fit (several tasks side by side). Variants go from richest to shortest. `reservedPx` is
 * room already taken in the row by something else (the overlap mark).
 */
export function compactMeta(blockWidth: number, variants: readonly string[], reservedPx = 0): string | null {
  const room = blockWidth - ROW_PADDING_PX - MIN_TITLE_PX - META_GAP_PX - reservedPx;
  for (const text of variants) {
    if (text !== "" && text.length * META_CHAR_PX <= room) return text;
  }
  return null;
}

/** A block narrower than this has no room for the category icon next to the title. */
export const MIN_ICON_BLOCK_WIDTH = 120;

export function showCompactIcon(blockWidth: number): boolean {
  return blockWidth >= MIN_ICON_BLOCK_WIDTH;
}
