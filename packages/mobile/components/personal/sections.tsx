import type { ComponentType } from "react";
import type { PageSlug } from "../../lib/settings-menu";
import { ArchiveSection } from "../settings/ArchiveSection";
import { BackupSection } from "../settings/BackupSection";
import { RecoverySection } from "../settings/RecoverySection";
import { UpdateSection } from "../update/UpdateSection";
import { AboutSection } from "./AboutSection";
import { AppearanceSection } from "./AppearanceSection";
import { AssistantSection } from "./AssistantSection";
import { CalendarSection } from "./CalendarSection";
import { CultivationSection } from "./CultivationSection";
import { CategoriesSection } from "./CategoriesSection";
import { SpecialDaysSection } from "./SpecialDaysSection";
import { CycleSection } from "./CycleSection";
import { DefaultsSection } from "./DefaultsSection";
import { GreetingSection } from "./GreetingSection";
import { HabitsSection } from "./HabitsSection";
import { LanguageSection } from "./LanguageSection";
import { NotificationsSection } from "./NotificationsSection";
import { WidgetSection } from "./WidgetSection";

export type SettingsPagePart = {
  /** English label (also the translation key) over the part's card. Left out when the page has one part: the header names it. */
  title?: string;
  Component: ComponentType;
};

export type SettingsPageEntry = {
  /** The page body, one card per part under the page header. */
  parts: readonly SettingsPagePart[];
  /** A part has a text field, so the page keeps room for the on-screen keyboard. */
  hasTextInput?: boolean;
};

const single = (Component: ComponentType, hasTextInput = false): SettingsPageEntry => ({ parts: [{ Component }], hasTextInput });

/**
 * Bodies of the settings pages, one per slug of lib/settings-menu.ts (the menu rows, their titles, icons, groups and
 * summaries live there). `Record<PageSlug, ...>` makes a menu row without a body a compile error. To add a Personal
 * page: add its row in lib/settings-menu.ts and its body here. Three pages hold several parts, each in its own card:
 * Appearance (theme, language, greeting), Categories (categories, special days, habit hints) and Backup (backup,
 * archive, data recovery). Add buttons sit inside their part's card (an `IconButton` under the list); no page floats one now.
 */
export const SETTINGS_PAGES: Record<PageSlug, SettingsPageEntry> = {
  appearance: {
    parts: [
      { title: "Appearance", Component: AppearanceSection },
      { title: "Language", Component: LanguageSection },
      { title: "Greeting", Component: GreetingSection },
    ],
    hasTextInput: true,
  },
  assistant: single(AssistantSection, true),
  cultivation: single(CultivationSection),
  "new-tasks": single(DefaultsSection, true),
  calendar: single(CalendarSection),
  categories: {
    parts: [
      { title: "Categories", Component: CategoriesSection },
      { title: "Special days", Component: SpecialDaysSection },
      { title: "Habit hints", Component: HabitsSection },
    ],
  },
  notifications: single(NotificationsSection),
  widget: single(WidgetSection),
  cycle: single(CycleSection),
  backup: {
    parts: [
      { title: "Backup", Component: BackupSection },
      { title: "Archive", Component: ArchiveSection },
      { title: "Data recovery", Component: RecoverySection },
    ],
  },
  updates: single(UpdateSection),
  about: single(AboutSection),
};
