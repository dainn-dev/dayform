/**
 * Where the assistant stands while its chat sheet is open (framework-free, tested). The sheet is drawn under the
 * assistant, so the assistant stays visible and can still be dragged; when the sheet would cover it, it steps up.
 */
export type LiftBox = {
  /** The assistant's height (dp). */
  height: number;
  /** The highest top it may have (below the status bar). */
  minY: number;
  /** Room left between its feet and the sheet. */
  gap: number;
};

/** The new top (dp) for an assistant whose top is `y` when the sheet's top edge is at `sheetTop`, or null to stay. */
export function liftAbove(y: number, sheetTop: number, { height, minY, gap }: LiftBox): number | null {
  const highest = sheetTop - gap - height;
  if (y <= highest) return null;
  return Math.max(minY, highest);
}
