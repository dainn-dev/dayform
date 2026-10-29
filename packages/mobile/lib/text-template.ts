/** Fills `{name}` placeholders of an already translated string; unknown placeholders stay as they are. */
export function fillPlaceholders(text: string, values: Readonly<Record<string, string>>): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(values, name) ? values[name]! : match);
}
