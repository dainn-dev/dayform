import type { ComponentType } from "react";
import type { PageSlug } from "../../lib/settings-menu";
import { ArchiveSection } from "../settings/ArchiveSection";
import { BackupSection } from "../settings/BackupSection";
import { RecoverySection } from "../settings/RecoverySection";
import { UpdateSection } from "../update/UpdateSection";
import { AboutSection } from "./AboutSection";
import { AppearanceSection } from "./AppearanceSection";
import { CalendarSection } from "./CalendarSection";
import { CategoriesSection } from "./CategoriesSection";
import { SpecialDaysSection } from "./SpecialDaysSection";
import { CycleSection } from "./CycleSection";
import { DefaultsSection } from "./DefaultsSection";
import { GreetingSection } from "./GreetingSection";
import { HabitsSection } from "./HabitsSection";
import { LanguageSection } from "./LanguageSection";
import { NotificationsSection } from "./NotificationsSection";
import { WidgetSection } from "./WidgetSection";

export type SettingsPageEntry = {
  /** The body of the page, drawn inside one card under the page header. */
  Component: ComponentType;
  /** The body has a text field, so the page keeps room for the on-screen keyboard. */
  hasTextInput?: boolean;
};

/**
 * Bodies of the settings pages, one per slug of lib/settings-menu.ts (the menu rows, their titles, icons, groups and
 * summaries live there). `Record<PageSlug, ...>` makes a menu row without a body a compile error. To add a Personal
 * page: add its row in lib/settings-menu.ts and its body here.
 */
export const SETTINGS_PAGES: Record<PageSlug, SettingsPageEntry> = {
  appearance: { Component: AppearanceSection },
  language: { Component: LanguageSection },
  greeting: { Component: GreetingSection, hasTextInput: true },
  "new-tasks": { Component: DefaultsSection, hasTextInput: true },
  calendar: { Component: CalendarSection },
  categories: { Component: CategoriesSection },
  "special-days": { Component: SpecialDaysSection },
  habits: { Component: HabitsSection },
  notifications: { Component: NotificationsSection },
  widget: { Component: WidgetSection },
  cycle: { Component: CycleSection },
  backup: { Component: BackupSection },
  archive: { Component: ArchiveSection },
  recovery: { Component: RecoverySection },
  updates: { Component: UpdateSection },
  about: { Component: AboutSection },
};
