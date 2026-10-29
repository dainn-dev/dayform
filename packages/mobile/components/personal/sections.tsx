import type { ComponentType } from "react";
import { CalendarSection } from "./CalendarSection";
import { CategoriesSection } from "./CategoriesSection";
import { DefaultsSection } from "./DefaultsSection";
import { GreetingSection } from "./GreetingSection";
import { HabitsSection } from "./HabitsSection";
import { NotificationsSection } from "./NotificationsSection";
import { WidgetSection } from "./WidgetSection";

export type PersonalSectionEntry = {
  key: string;
  /** English card title; also the translation key. */
  title: string;
  Component: ComponentType;
};

/**
 * Preference cards of the Personal tab, in display order (after Appearance, before Updates). To fill a stub, edit
 * its own file; to add a card, add one entry here. The card frame and title come from the screen.
 */
export const PERSONAL_SECTIONS: readonly PersonalSectionEntry[] = [
  { key: "defaults", title: "New tasks", Component: DefaultsSection },
  { key: "categories", title: "Categories", Component: CategoriesSection },
  { key: "calendar", title: "Calendar & time", Component: CalendarSection },
  { key: "notifications", title: "Notifications", Component: NotificationsSection },
  { key: "widget", title: "Widget", Component: WidgetSection },
  { key: "greeting", title: "Greeting", Component: GreetingSection },
  { key: "habits", title: "Habit hints", Component: HabitsSection },
];
