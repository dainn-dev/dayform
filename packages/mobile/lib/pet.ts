import { PET_KINDS, type PetKind } from "./settings";

/**
 * The pets the widget can show, in the order the Pet page lists them. The drawn cat is ours; the pixel cats and the
 * dog are the CC0 sprites of Shepardskin (opengameart.org/content/cat-sprites, /dog-sprites), the cats recoloured.
 * Every English label is also its translation key (lib/i18n/pet.ts).
 */
export const PET_LABELS: Record<PetKind, string> = {
  "round-cat": "Round cat",
  "gray-cat": "Gray cat",
  "orange-cat": "Orange cat",
  dog: "Dog",
  off: "No pet",
};

export const PET_CHOICES: readonly { value: PetKind; label: string }[] = PET_KINDS.map(value => ({ value, label: PET_LABELS[value] }));

/** The line under "Pet" in the menu: the pet's name and whether it strolls ("No pet" alone when there is none). */
export function petSummary(kind: PetKind, walks: boolean, t: (text: string) => string): string {
  if (kind === "off") return t(PET_LABELS.off);
  return `${t(PET_LABELS[kind])} · ${t(walks ? "Strolling" : "Resting")}`;
}
