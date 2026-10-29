import React, { useState } from "react";
import { useCategories } from "../../lib/categories-context";
import { categoryToOffer, durationHintTexts, repeatHintText } from "../../lib/habits-copy";
import { useLanguage } from "../../lib/language";
import type { Repeat } from "../../lib/planner";
import { fillPlaceholders } from "../../lib/text-template";
import { HintCard, type HintAction } from "./HintCard";
import { useHabitHints } from "./useHabitHints";

type Props = {
  /** The title typed so far. */
  title: string;
  /** The duration field's value, in minutes as typed. */
  duration: string;
  category: string;
  /** True once the user chose a category in this editor session. */
  categoryTouched: boolean;
  repeat: Repeat | null;
  /** Repeat only exists for scheduled tasks, so the repeat hint is only shown for them. */
  scheduled: boolean;
  onApplyDuration: (minutes: string) => void;
  onApplyCategory: (category: string) => void;
  onApplyRepeat: (repeat: Repeat) => void;
};

/**
 * Suggestions shown under the duration row of a NEW task: a usual duration (with the category it usually has)
 * and a repeat rule. Each can be dismissed for the rest of the editor session. Renders nothing while habit
 * hints are off. Mount it only for new tasks.
 */
export function NewTaskHints({ title, duration, category, categoryTouched, repeat, scheduled, onApplyDuration, onApplyCategory, onApplyRepeat }: Props) {
  const { t, locale } = useLanguage();
  const { visible, label } = useCategories();
  const hints = useHabitHints({ typedTitle: title });
  const [durationDismissed, setDurationDismissed] = useState(false);
  const [repeatDismissed, setRepeatDismissed] = useState(false);

  const suggestion = hints.duration;
  const showDuration = suggestion !== null && !durationDismissed && duration.trim() !== String(suggestion.minutes);
  const showRepeat = hints.repeat !== null && !repeatDismissed && scheduled && repeat === null;
  if (!showDuration && !showRepeat) return null;

  const durationCard = (() => {
    if (!showDuration || suggestion === null) return null;
    const texts = durationHintTexts(suggestion, t);
    const actions: HintAction[] = [{ key: "duration", label: texts.apply, onPress: () => onApplyDuration(String(suggestion.minutes)) }];
    const offered = categoryToOffer({ suggested: suggestion.category, visible, touched: categoryTouched, current: category });
    if (offered !== null) {
      const text = fillPlaceholders(t("Set category to {category}"), { category: label(offered) });
      actions.push({ key: "category", label: text, onPress: () => onApplyCategory(offered) });
    }
    return <HintCard headline={texts.usually} detail={texts.basedOn} actions={actions} onDismiss={() => setDurationDismissed(true)} />;
  })();

  const repeatSuggestion = hints.repeat;
  const repeatCard = showRepeat && repeatSuggestion !== null
    ? <HintCard headline={repeatHintText(repeatSuggestion, t, locale)}
      actions={[{ key: "repeat", label: t("Make it repeat"), onPress: () => onApplyRepeat(repeatSuggestion.repeat) }]}
      onDismiss={() => setRepeatDismissed(true)} />
    : null;
  return <>{durationCard}{repeatCard}</>;
}
