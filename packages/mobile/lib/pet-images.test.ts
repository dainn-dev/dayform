import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PET_CHOICES } from "./pet";

const ROOT = join(import.meta.dir, "..");
const ART_OF = { "gray-cat": "gray", dog: "dog", kitsune: "kitsune", chicken: "chicken", goku: "goku", love: "boy" } as const;
// A pet made of two characters: the second one's art must be as complete as the first. Its preview folder is named after the kind.
const PARTNER_OF: Record<string, string> = { love: "girl" };
const PREVIEW_DIR_OF: Record<string, string> = { love: "love" };
const source = readFileSync(join(ROOT, "lib", "pet-images.ts"), "utf8");

// Bun cannot load PNGs, so this checks the asset folders and the require list in pet-images.ts against each other.
describe("pet preview frames", () => {
  test("every pet that can be chosen is mapped, and 'No pet' is not", () => {
    for (const { value } of PET_CHOICES) {
      const mapped = source.includes(`  ${value}: [`) || source.includes(`  "${value}": [`);
      expect(mapped).toBe(value !== "off");
    }
  });

  test("every pet is known to the widget: its art is listed in WidgetPet.kt and has the frames the script needs", () => {
    const kotlin = readFileSync(join(ROOT, "modules", "dayform-widget", "android", "src", "main", "java", "dev", "dayform", "widget", "WidgetPet.kt"), "utf8");
    const drawables = readdirSync(join(ROOT, "modules", "dayform-widget", "android", "src", "main", "res", "drawable-nodpi"));
    for (const [kind, art] of Object.entries(ART_OF)) {
      expect(kotlin.includes(`"${kind}" to "${art}"`)).toBe(true);
      for (const each of [art, PARTNER_OF[kind]].filter(Boolean)) {
        // The script cannot start without a right-facing walk, and uses these sets for its other actions.
        expect(drawables).toContain(`dayform_pet_${each}_walk_r_0.png`);
        expect(drawables).toContain(`dayform_pet_${each}_walk_l_0.png`);
        expect(drawables.some(name => name.startsWith(`dayform_pet_${each}_sit_`))).toBe(true);
        expect(drawables.some(name => name.startsWith(`dayform_pet_${each}_sleep_`))).toBe(true);
      }
    }
  });

  test("Love has the frames of the flower scene: Boy gives, Girl receives, in both directions", () => {
    const drawables = readdirSync(join(ROOT, "modules", "dayform-widget", "android", "src", "main", "res", "drawable-nodpi"));
    for (const name of ["dayform_pet_boy_gift_l_0.png", "dayform_pet_boy_gift_r_0.png", "dayform_pet_girl_receive_l_0.png", "dayform_pet_girl_receive_r_0.png"]) {
      expect(drawables).toContain(name);
    }
  });

  test("every walking frame on disk is required, in order, and there are at least two to animate", () => {
    for (const [kind, art] of Object.entries(ART_OF)) {
      const folder = PREVIEW_DIR_OF[kind] ?? art;
      const dir = join(ROOT, "assets", "pets", folder);
      expect(existsSync(dir)).toBe(true);
      const files = readdirSync(dir).filter(name => /^walk_\d+\.png$/.test(name));
      expect(files.length).toBeGreaterThanOrEqual(2);
      const line = source.split("\n").find(row => row.includes(`"../assets/pets/${folder}/`)) ?? "";
      const required = [...line.matchAll(/walk_(\d+)\.png/g)].map(match => Number(match[1]));
      expect({ kind, required }).toEqual({ kind, required: files.map((_, index) => index) });
    }
  });
});
