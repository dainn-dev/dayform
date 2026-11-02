import type { Colors } from "../constants/palettes";
import type { TimeFormat } from "./planner";
import type { Settings } from "./settings";
import { fillPlaceholders } from "./text-template";
import { petSummary } from "./pet";
import type { ThemePreference } from "./theme-preference";
import { hourLabel } from "./timeline-config";

// Pure definition of the Personal menu: which rows exist, how they are grouped, where they lead and the one-line
// summary under each title. No React and no storage here, so it is unit-tested. The page bodies are registered by
// slug in components/personal/sections.tsx (typed over PageSlug, so a new row without a body fails to compile).

type Translate = (text: string) => string;

export type MenuGroupId = "personalise" | "tasks" | "reminders" | "health" | "data" | "app";
export type PageSlug =
  | "appearance" | "assistant" | "cultivation" | "new-tasks" | "calendar" | "categories" | "notifications" | "widget"
  | "cycle" | "backup" | "updates" | "about";
export type MenuRowId = PageSlug | "cycle-tracking";
/** A color slot of `Colors.<scheme>.category`: the chip is drawn with its `bg` and `accent`. */
export type MenuTint = keyof (typeof Colors)["light"]["category"];

export type MenuRow = {
  id: MenuRowId;
  /** The page the row leads to (`/settings/<slug>`), except the Cycle row, see `rowHref`. */
  slug: PageSlug;
  group: MenuGroupId;
  /** English title; also the translation key. */
  title: string;
  /** An Ionicons outline glyph. */
  icon: string;
  tint: MenuTint;
};
export type MenuGroup = { id: MenuGroupId; title: string; rows: readonly MenuRow[] };

/** Plain values the summaries need. Built by components/menu/use-menu-inputs.ts from the app's contexts. */
export type MenuInputs = {
  settings: Settings;
  themePreference: ThemePreference;
  /** The interface language (lib/language.tsx), shown by name in its own language. */
  language: "en" | "vi";
  /** Categories a picker offers (visible built-ins plus custom ones). */
  categoryCount: number;
  categoryName: (id: string) => string;
  /** The cultivation rank in words, or null while it is off or not read yet. */
  cultivationLine?: string | null;
  /** How many special days (birthdays, anniversaries) the user keeps. */
  specialDayCount: number;
  version: string;
  /** The merged, already translated update status, or null when there is nothing to say. */
  updateLine: string | null;
  /** Only the switches: tracker data (periods, predictions) never reaches the menu. */
  cycle: { ready: boolean; enabled: boolean; lockEnabled: boolean };
  timeFormat: TimeFormat;
  duration: (minutes: number) => string;
  /** A stored HH:mm in the chosen 12h/24h format. */
  time: (value: string) => string;
  t: Translate;
};

const SEPARATOR = " · ";
const MINUTES_PER_HOUR = 60;

/** Display order of the menu. To add a Personal page: one row here and one body in components/personal/sections.tsx. */
export const MENU_ROWS: readonly MenuRow[] = [
  { id: "appearance", slug: "appearance", group: "personalise", title: "Appearance", icon: "color-palette-outline", tint: "violet" },
  { id: "assistant", slug: "assistant", group: "personalise", title: "Assistant", icon: "sparkles-outline", tint: "violet" },
  { id: "cultivation", slug: "cultivation", group: "personalise", title: "Rank", icon: "flame-outline", tint: "amber" },
  { id: "new-tasks", slug: "new-tasks", group: "tasks", title: "New tasks", icon: "add-circle-outline", tint: "Focus" },
  { id: "calendar", slug: "calendar", group: "tasks", title: "Calendar & time", icon: "calendar-outline", tint: "sky" },
  { id: "categories", slug: "categories", group: "tasks", title: "Categories", icon: "pricetags-outline", tint: "magenta" },
  { id: "notifications", slug: "notifications", group: "reminders", title: "Notifications", icon: "notifications-outline", tint: "coral" },
  { id: "widget", slug: "widget", group: "reminders", title: "Widget", icon: "apps-outline", tint: "Work" },
  { id: "cycle", slug: "cycle", group: "health", title: "Cycle", icon: "flower-outline", tint: "Wellness" },
  { id: "cycle-tracking", slug: "cycle", group: "health", title: "Cycle tracking", icon: "toggle-outline", tint: "Wellness" },
  { id: "backup", slug: "backup", group: "data", title: "Backup", icon: "save-outline", tint: "slate" },
  { id: "updates", slug: "updates", group: "app", title: "Updates", icon: "cloud-download-outline", tint: "mint" },
  { id: "about", slug: "about", group: "app", title: "About", icon: "information-circle-outline", tint: "violet" },
];

const GROUP_TITLES: ReadonlyArray<readonly [MenuGroupId, string]> = [
  ["personalise", "Personalise"],
  ["tasks", "Tasks & calendar"],
  ["reminders", "Reminders & widget"],
  ["health", "Health"],
  ["data", "Data"],
  ["app", "App"],
];

export const MENU_GROUPS: readonly MenuGroup[] = GROUP_TITLES.map(([id, title]) => ({
  id, title, rows: MENU_ROWS.filter(row => row.group === id),
}));

/** Every page slug, once. */
export const PAGE_SLUGS: readonly PageSlug[] = [...new Set(MENU_ROWS.map(row => row.slug))];

/**
 * Pages that were merged into another one. Their old deep links (`dayform://settings/language`) and any stored
 * `router.push` target still open the page that now holds them.
 */
const MERGED_SLUGS: Readonly<Record<string, PageSlug>> = {
  language: "appearance", greeting: "appearance",
  "special-days": "categories", habits: "categories",
  archive: "backup", recovery: "backup",
};

/** The row that owns a route parameter, or null when it is not a page (also for arrays and inherited names). */
export function findPage(slug: unknown): MenuRow | null {
  if (typeof slug !== "string") return null;
  const target = Object.hasOwn(MERGED_SLUGS, slug) ? MERGED_SLUGS[slug] : slug;
  return MENU_ROWS.find(row => row.slug === target) ?? null;
}

/** "Cycle tracking" (turn the tracker on or off) is offered only once the tracker is known to be on. */
function isVisible(row: MenuRow, inputs: MenuInputs): boolean {
  return row.id !== "cycle-tracking" || (inputs.cycle.ready && inputs.cycle.enabled);
}

/** The groups with the rows that apply right now. */
export function menuGroups(inputs: MenuInputs): readonly MenuGroup[] {
  return MENU_GROUPS.map(group => ({ ...group, rows: group.rows.filter(row => isVisible(row, inputs)) }));
}

export type MenuHref = "/cycle" | `/settings/${PageSlug}`;

/** The Cycle row opens the private tracker itself (its lock gate lives there) once tracking is on; until then it opens the page that turns it on. */
export function rowHref(id: MenuRowId, inputs: MenuInputs): MenuHref {
  const row = MENU_ROWS.find(candidate => candidate.id === id)!;
  if (id === "cycle" && inputs.cycle.ready && inputs.cycle.enabled) return "/cycle";
  return `/settings/${row.slug}`;
}

const THEME_LABELS: Record<ThemePreference, string> = { system: "System", light: "Light", dark: "Dark" };
const ACCENT_LABELS: Record<Settings["accent"], string> = {
  violet: "Violet", ocean: "Ocean", lagoon: "Lagoon", forest: "Forest", sunset: "Sunset", blossom: "Blossom",
};
const WEEK_START_LABELS: Record<Settings["calendar"]["weekStart"], string> = { mon: "Monday", sun: "Sunday", sat: "Saturday" };

const join = (parts: readonly string[]) => parts.join(SEPARATOR);

function categorySummary(count: number, t: Translate): string {
  return count === 1 ? t("1 category") : fillPlaceholders(t("{count} categories"), { count: String(count) });
}

function specialDaySummary(count: number, t: Translate): string {
  if (count === 0) return t("No special days");
  return count === 1 ? t("1 special day") : fillPlaceholders(t("{count} special days"), { count: String(count) });
}

function calendarSummary({ settings: { calendar }, timeFormat, t }: MenuInputs): string {
  const window = `${hourLabel(calendar.dayStart / MINUTES_PER_HOUR, timeFormat)} – ${hourLabel(calendar.dayEnd / MINUTES_PER_HOUR, timeFormat)}`;
  return join([window, t(WEEK_START_LABELS[calendar.weekStart])]);
}

function notificationsSummary({ settings: { notifications }, time, t }: MenuInputs): string {
  const parts: string[] = [];
  if (notifications.quietEnabled) {
    parts.push(fillPlaceholders(t("Quiet {from} – {to}"), { from: time(notifications.quietFrom), to: time(notifications.quietTo) }));
  }
  if (notifications.summaryEnabled) {
    parts.push(fillPlaceholders(t("Morning summary {time}"), { time: time(notifications.summaryTime) }));
  }
  return parts.length > 0 ? join(parts) : t("Standard reminders");
}

/** Only switches: never a date, a prediction or a count of periods, whatever the lock says. */
function cycleSummary({ cycle, t }: MenuInputs): string {
  if (!cycle.ready) return t("Private tracker");
  if (!cycle.enabled) return t("Off");
  return cycle.lockEnabled ? join([t("On"), t("Locked")]) : t("On");
}

const SUMMARIES: Record<MenuRowId, (inputs: MenuInputs) => string> = {
  // The page holds the theme, the language and the greeting. A language is always named in itself, so that name is never translated.
  appearance: ({ themePreference, settings, language, t }) => join([t(THEME_LABELS[themePreference]), t(ACCENT_LABELS[settings.accent]), language === "vi" ? "Tiếng Việt" : "English"]),
  assistant: ({ settings: { assistant, ai }, t }) => assistant.enabled ? join([assistant.name, t(ai.enabled ? "AI on" : "AI off")]) : t("Hidden"),
  cultivation: ({ settings, cultivationLine, t }) => (settings.xp.enabled ? cultivationLine ?? t(settings.xp.style === "engineer" ? "XP for finished tasks" : "Experience for finished tasks") : t("Off")),
  "new-tasks": ({ settings: { defaults }, duration, categoryName }) => join([duration(defaults.duration), categoryName(defaults.category)]),
  calendar: calendarSummary,
  // The page holds the categories, the special days and the habit hints.
  categories: ({ categoryCount, specialDayCount, t }) => join([categorySummary(categoryCount, t), specialDaySummary(specialDayCount, t)]),
  notifications: notificationsSummary,
  widget: ({ settings, t }) => join([t(settings.widget.showTitles ? "Titles shown" : "Titles hidden"), petSummary(settings.pet.kind, settings.pet.walks, t)]),
  cycle: cycleSummary,
  "cycle-tracking": ({ t }) => t("Turn tracking off"),
  // The page holds the backup, the archive and the data recovery.
  backup: ({ t }) => t("Backup, archive and recovery"),
  updates: ({ updateLine, version, t }) => updateLine ?? fillPlaceholders(t("Version {version}"), { version }),
  about: ({ t }) => t("Your data stays with you"),
};

/** The short, already translated line under a row's title. */
export function summaryFor(id: MenuRowId, inputs: MenuInputs): string {
  return SUMMARIES[id](inputs);
}
