import type { ImageSourcePropType } from "react-native";
import type { PetKind } from "./settings";

/**
 * The walking frames of each pet, shown on the Pet page so the user sees the animal before picking it. They are the
 * right-facing walk frames of the widget's drawables (modules/dayform-widget/.../drawable-nodpi), copied here because
 * Metro cannot reach the native resources; the paths are literals because Metro resolves `require` at build time.
 */
export const PET_PREVIEW_FRAMES: Readonly<Record<Exclude<PetKind, "off">, readonly ImageSourcePropType[]>> = {
  "gray-cat": [require("../assets/pets/gray/walk_0.png"), require("../assets/pets/gray/walk_1.png"), require("../assets/pets/gray/walk_2.png"), require("../assets/pets/gray/walk_3.png"), require("../assets/pets/gray/walk_4.png"), require("../assets/pets/gray/walk_5.png")],
  "orange-cat": [require("../assets/pets/orange/walk_0.png"), require("../assets/pets/orange/walk_1.png"), require("../assets/pets/orange/walk_2.png"), require("../assets/pets/orange/walk_3.png"), require("../assets/pets/orange/walk_4.png"), require("../assets/pets/orange/walk_5.png")],
  dog: [require("../assets/pets/dog/walk_0.png"), require("../assets/pets/dog/walk_1.png"), require("../assets/pets/dog/walk_2.png"), require("../assets/pets/dog/walk_3.png"), require("../assets/pets/dog/walk_4.png"), require("../assets/pets/dog/walk_5.png")],
  kitsune: [require("../assets/pets/kitsune/walk_0.png"), require("../assets/pets/kitsune/walk_1.png"), require("../assets/pets/kitsune/walk_2.png"), require("../assets/pets/kitsune/walk_3.png"), require("../assets/pets/kitsune/walk_4.png"), require("../assets/pets/kitsune/walk_5.png"), require("../assets/pets/kitsune/walk_6.png"), require("../assets/pets/kitsune/walk_7.png")],
  chicken: [require("../assets/pets/chicken/walk_0.png"), require("../assets/pets/chicken/walk_1.png"), require("../assets/pets/chicken/walk_2.png"), require("../assets/pets/chicken/walk_3.png"), require("../assets/pets/chicken/walk_4.png"), require("../assets/pets/chicken/walk_5.png")],
  paimon: [require("../assets/pets/paimon/walk_0.png"), require("../assets/pets/paimon/walk_1.png"), require("../assets/pets/paimon/walk_2.png"), require("../assets/pets/paimon/walk_3.png"), require("../assets/pets/paimon/walk_4.png"), require("../assets/pets/paimon/walk_5.png")],
  goku: [require("../assets/pets/goku/walk_0.png"), require("../assets/pets/goku/walk_1.png"), require("../assets/pets/goku/walk_2.png"), require("../assets/pets/goku/walk_3.png")],
};
