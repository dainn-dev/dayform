import React, { useState, type ReactNode } from "react";
import { PersonalCard } from "../personal/PersonalCard";
import { IconButton } from "../ui/IconButton";
import { HeaderActionProvider, type HeaderAction } from "./header-action";

/**
 * One part of a settings page: a card with its title and, when the part asks for it (`useHeaderAction`), a "+" button
 * on the same line as the title.
 */
export function PartCard({ title, children }: { title?: string; children: ReactNode }) {
  const [action, setAction] = useState<HeaderAction | null>(null);
  const button = action === null ? undefined
    : <IconButton icon="add" label={action.label} disabled={action.disabled} onPress={action.onPress} />;
  return <PersonalCard title={title} action={button}>
    <HeaderActionProvider register={setAction}>{children}</HeaderActionProvider>
  </PersonalCard>;
}
