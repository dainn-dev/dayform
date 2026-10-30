import type { Colors } from "../constants/palettes";
import type { TimeFormat } from "./planner";
import type { Settings } from "./settings";
import { fillPlaceholders } from "./text-template";
import type { ThemePreference } from "./theme-preference";
import { hourLabel } from "./timeline-config";

// Pure definition of the Personal menu: which rows exist, how they are grouped, where they lead and the one-line
// summary under each title. No React and no storage here, so it is unit-tested. The page bodies are registered by
// slug in components/personal/sections.tsx (typed over PageSlug, so a new row without a body fails to compile).

type Translate = (text: string) => string;

export type MenuGroupId = "personalise" | "tasks" | "reminders" | "health" | "data" | "app";
export type PageSlug =
  | "appearance" | "greeting" | "new-tasks" | "calendar" | "categories" | "habits" | "notifications" | "widget"
  | "cycle" | "backup" | "archive" | "recovery" | "updates" | "about";
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
  /** Categories a picker offers (visible built-ins plus custom ones). */
  categoryCount: number;
  categoryName: (id: string) => string;
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
  { id: "greeting", slug: "greeting", group: "personalise", title: "Greeting", icon: "sunny-outline", tint: "amber" },
  { id: "new-tasks", slug: "new-tasks", group: "tasks", title: "New tasks", icon: "add-circle-outline", tint: "Focus" },
  { id: "calendar", slug: "calendar", group: "tasks", title: "Calendar & time", icon: "calendar-outline", tint: "sky" },
  { id: "categories", slug: "categories", group: "tasks", title: "Categories", icon: "pricetags-outline", tint: "magenta" },
  { id: "habits", slug: "habits", group: "tasks", title: "Habit hints", icon: "bulb-outline", tint: "mint" },
  { id: "notifications", slug: "notifications", group: "reminders", title: "Notifications", icon: "notifications-outline", tint: "coral" },
  { id: "widget", slug: "widget", group: "reminders", title: "Widget", icon: "apps-outline", tint: "Work" },
  { id: "cycle", slug: "cycle", group: "health", title: "Cycle", icon: "flower-outline", tint: "Wellness" },
  { id: "cycle-tracking", slug: "cycle", group: "health", title: "Cycle tracking", icon: "toggle-outline", tint: "Wellness" },
  { id: "backup", slug: "backup", group: "data", title: "Backup", icon: "save-outline", tint: "slate" },
  { id: "archive", slug: "archive", group: "data", title: "Archive", icon: "archive-outline", tint: "slate" },
  { id: "recovery", slug: "recovery", group: "data", title: "Data recovery", icon: "medkit-outline", tint: "slate" },
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

/** The row that owns a route parameter, or null when it is not a page (also for arrays and inherited names). */
export function findPage(slug: unknown): MenuRow | null {
  if (typeof slug !== "string") return null;
  return MENU_ROWS.find(row => row.slug === slug) ?? null;
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
const SLOGAN_LABELS: Record<Settings["greeting"]["sloganStyle"], string> = {
  rotate: "Rotating slogan", custom: "Custom slogan", off: "No slogan",
};

const join = (parts: readonly string[]) => parts.join(SEPARATOR);

function categorySummary(count: number, t: Translate): string {
  return count === 1 ? t("1 category") : fillPlaceholders(t("{count} categories"), { count: String(count) });
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
  appearance: ({ themePreference, settings, t }) => join([t(THEME_LABELS[themePreference]), t(ACCENT_LABELS[settings.accent])]),
  greeting: ({ settings: { greeting }, t }) => join([t(greeting.showName ? "Name shown" : "Name hidden"), t(SLOGAN_LABELS[greeting.sloganStyle])]),
  "new-tasks": ({ settings: { defaults }, duration, categoryName }) => join([duration(defaults.duration), categoryName(defaults.category)]),
  calendar: calendarSummary,
  categories: ({ categoryCount, t }) => categorySummary(categoryCount, t),
  habits: ({ settings, t }) => t(settings.habits.hints ? "On" : "Off"),
  notifications: notificationsSummary,
  widget: ({ settings, t }) => t(settings.widget.showTitles ? "Titles shown" : "Titles hidden"),
  cycle: cycleSummary,
  "cycle-tracking": ({ t }) => t("Turn tracking off"),
  backup: ({ t }) => t("Export or import your data"),
  archive: ({ t }) => t("Old completed tasks"),
  recovery: ({ t }) => t("Restore a saved copy"),
  updates: ({ updateLine, version, t }) => updateLine ?? fillPlaceholders(t("Version {version}"), { version }),
  about: ({ t }) => t("Your data stays on this device"),
};

/** The short, already translated line under a row's title. */
export function summaryFor(id: MenuRowId, inputs: MenuInputs): string {
  return SUMMARIES[id](inputs);
}
