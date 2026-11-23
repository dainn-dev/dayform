/**
 * Font files shipped in assets/fonts (OFL, subset to Latin + Vietnamese; licences next to them). The keys are the
 * family names the theme uses (`fontFileName` in lib/design-theme.ts); lib/design-theme.test.ts checks that every name
 * a style needs is listed here (it reads this file as text, since `bun test` cannot require a .ttf).
 */
export const FONT_FILES = {
  "BeVietnamPro-400": require("../assets/fonts/BeVietnamPro-400.ttf"),
  "BeVietnamPro-500": require("../assets/fonts/BeVietnamPro-500.ttf"),
  "BeVietnamPro-600": require("../assets/fonts/BeVietnamPro-600.ttf"),
  "BeVietnamPro-700": require("../assets/fonts/BeVietnamPro-700.ttf"),
  "BeVietnamPro-800": require("../assets/fonts/BeVietnamPro-800.ttf"),
  "Inter-400": require("../assets/fonts/Inter-400.ttf"),
  "Inter-500": require("../assets/fonts/Inter-500.ttf"),
  "Inter-600": require("../assets/fonts/Inter-600.ttf"),
  "Inter-700": require("../assets/fonts/Inter-700.ttf"),
  "Newsreader-400": require("../assets/fonts/Newsreader-400.ttf"),
  "Newsreader-500": require("../assets/fonts/Newsreader-500.ttf"),
  "Newsreader-600": require("../assets/fonts/Newsreader-600.ttf"),
  "JetBrainsMono-400": require("../assets/fonts/JetBrainsMono-400.ttf"),
  "JetBrainsMono-600": require("../assets/fonts/JetBrainsMono-600.ttf"),
} as const;
