import { PET_KINDS, type PetKind } from "./settings";

/**
 * The pets the widget can show, in the order the Pet page lists them. The pixel cat and the
 * dog are the CC0 sprites of Shepardskin (opengameart.org/content/cat-sprites, /dog-sprites), the cat recoloured.
 * The kitsune is the owner's own art, cut into frames (walk/run face a side, walk_d faces the viewer for stepping down and walk_u shows the back for stepping up; sit, look, bark and sleep face the front).
 * The chicken is art supplied by the owner (its source is not recorded in the repo), with the same sets as the kitsune.
 * Paimon (a Live2D model of a miHoYo character, a fan model rendered into frames, included at the owner's request; no licence came with it) floats, so its walk is a front-facing hover mirrored per direction; it has no walk_d / walk_u.
 * Goku Black is a fan pixel sprite sheet (a Dragon Ball character of Toei / Bird Studio, author not recorded, no licence), cut into frames and given a fighter's own script (GokuPet.kt); the art faces right and the left set is its mirror.
 * Every English label is also its translation key (lib/i18n/pet.ts).
 */
export const PET_LABELS: Record<PetKind, string> = {
  "gray-cat": "Gray cat",
  dog: "Dog",
  kitsune: "Kitsune",
  chicken: "Chicken",
  paimon: "Paimon",
  goku: "Goku Black",
  off: "No pet",
};

export const PET_CHOICES: readonly { value: PetKind; label: string }[] = PET_KINDS.map(value => ({ value, label: PET_LABELS[value] }));

/** The line under "Pet" in the menu: the pet's name and whether it strolls ("No pet" alone when there is none). */
export function petSummary(kind: PetKind, walks: boolean, t: (text: string) => string): string {
  if (kind === "off") return t(PET_LABELS.off);
  return `${t(PET_LABELS[kind])} · ${t(walks ? "Strolling" : "Resting")}`;
}
