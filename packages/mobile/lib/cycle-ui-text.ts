/**
 * Marks an English UI string in a pure lib module as a translation key. It returns the text unchanged; the component
 * translates it with `t()` and fills the `{placeholders}`. lib/i18n/cycle-ui.test.ts scans for `tx("...")` and
 * `t("...")` to make sure every key has a Vietnamese entry.
 */
export const tx = (text: string): string => text;

/** A translation key plus the values for its `{placeholders}` (already formatted for display). */
export type Fill = { text: string; values: Readonly<Record<string, string>> };

export const fill = (text: string, values: Readonly<Record<string, string>> = {}): Fill => ({ text, values });

export type Translate = (text: string) => string;
