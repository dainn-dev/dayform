import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PET_CHOICES } from "./pet";

const ROOT = join(import.meta.dir, "..");
const ART_OF = { "gray-cat": "gray", "orange-cat": "orange", dog: "dog", kitsune: "kitsune", chicken: "chicken", paimon: "paimon" } as const;
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
      // The script cannot start without a right-facing walk, and uses these sets for its other actions.
      expect(drawables).toContain(`dayform_pet_${art}_walk_r_0.png`);
      expect(drawables).toContain(`dayform_pet_${art}_walk_l_0.png`);
      expect(drawables.some(name => name.startsWith(`dayform_pet_${art}_sit_`))).toBe(true);
      expect(drawables.some(name => name.startsWith(`dayform_pet_${art}_sleep_`))).toBe(true);
    }
  });

  test("every walking frame on disk is required, in order, and there are at least two to animate", () => {
    for (const [kind, art] of Object.entries(ART_OF)) {
      const dir = join(ROOT, "assets", "pets", art);
      expect(existsSync(dir)).toBe(true);
      const files = readdirSync(dir).filter(name => /^walk_\d+\.png$/.test(name));
      expect(files.length).toBeGreaterThanOrEqual(2);
      const line = source.split("\n").find(row => row.includes(`"../assets/pets/${art}/`)) ?? "";
      const required = [...line.matchAll(/walk_(\d+)\.png/g)].map(match => Number(match[1]));
      expect({ kind, required }).toEqual({ kind, required: files.map((_, index) => index) });
    }
  });
});
