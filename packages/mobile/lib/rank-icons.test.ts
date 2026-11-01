import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ENGINEER, LAYERS, STAGES } from "./realm";

// bun cannot load a PNG through `require`, so the generated table (constants/rank-icons.ts) is read as text.
const mobile = join(import.meta.dir, "..");
const table = readFileSync(join(mobile, "constants", "rank-icons.ts"), "utf8");
const paths = [...table.matchAll(/require\("\.\.\/([^"]+)"\)/g)].map(match => match[1]);

describe("rank icons", () => {
  test("every path in the table is a file", () => {
    expect(paths.length).toBe((5 + ENGINEER.tracks.length) * LAYERS * STAGES);
    for (const path of paths) expect(existsSync(join(mobile, path))).toBe(true);
  });

  test("every engineer rank has art for every level and stage", () => {
    for (const track of ["intern", "fresher", "junior", "middle", "senior"]) {
      for (let layer = 1; layer <= LAYERS; layer++) {
        for (let stage = 1; stage <= STAGES; stage++) expect(paths).toContain(`assets/ranks/engineer/${track}/${layer}-${stage}.png`);
      }
    }
  });

  test("the first five cultivation realms have art for every step", () => {
    for (const realm of ["luyen-khi", "truc-co", "kim-dan", "nguyen-anh", "hoa-than"]) {
      for (let layer = 1; layer <= LAYERS; layer++) {
        for (let stage = 1; stage <= STAGES; stage++) expect(paths).toContain(`assets/ranks/${realm}/${layer}-${stage}.png`);
      }
    }
  });

  test("no path is listed twice", () => {
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("cultivation realms without art", () => {
  test("the later realms have no entry, so the fallback badge is drawn for them", () => {
    // Realms are numbered from 0 in the table: 0..4 have art, 5 (Luyện Hư) to 8 do not.
    const cultivation = table.slice(table.indexOf("cultivation: {"), table.indexOf("engineer: {"));
    for (let realm = 0; realm < 5; realm++) expect(cultivation).toContain(`    ${realm}: {`);
    for (let realm = 5; realm < 9; realm++) expect(cultivation).not.toContain(`    ${realm}: {`);
  });
});
