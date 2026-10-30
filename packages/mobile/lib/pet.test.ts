import { describe, expect, test } from "bun:test";
import { vi } from "./i18n/pet";
import { PET_CHOICES, PET_LABELS, petSummary } from "./pet";
import { PET_KINDS } from "./settings";

const say = (text: string) => `<${text}>`;

describe("pets", () => {
  test("every kind has a label and the choices follow the settings order", () => {
    expect(Object.keys(PET_LABELS).sort()).toEqual([...PET_KINDS].sort());
    expect(PET_CHOICES.map(choice => choice.value)).toEqual([...PET_KINDS]);
    expect(PET_CHOICES.every(choice => choice.label === PET_LABELS[choice.value])).toBe(true);
  });

  test("every label and summary word has a Vietnamese translation", () => {
    for (const label of Object.values(PET_LABELS)) expect(vi[label]).toBeDefined();
    expect(vi.Strolling).toBeDefined();
    expect(vi.Resting).toBeDefined();
    expect(vi.Pet).toBeDefined();
  });

  test("the summary names the pet and how it spends the day", () => {
    expect(petSummary("dog", true, say)).toBe("<Dog> · <Strolling>");
    expect(petSummary("gray-cat", false, say)).toBe("<Gray cat> · <Resting>");
  });

  test("no pet is just that, whatever the walking flag says", () => {
    expect(petSummary("off", true, say)).toBe("<No pet>");
    expect(petSummary("off", false, say)).toBe("<No pet>");
  });
});
