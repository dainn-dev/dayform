import React, { useMemo } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useColors } from "../../hooks/use-colors";
import type { ThemeColors } from "../../constants/theme";
import { monthGrid } from "../../lib/cycle-calendar";
import { useCycle } from "../../lib/cycle-context";
import type { CycleState, Period } from "../../lib/cycle-model";
import { dayActions, periodAt, type DayAction, type DialogTarget } from "../../lib/cycle-ui-actions";
import { KIND_META, isMarked } from "../../lib/cycle-ui-kinds";
import { tx } from "../../lib/cycle-ui-text";
import { useLanguage } from "../../lib/language";
import { CycleButton } from "./CycleButton";
import { KindSymbol } from "./KindSymbol";
import { useCycleFormat } from "./use-cycle-format";
import { useCycleReport } from "./use-cycle-report";

type Props = {
  date: string;
  state: CycleState;
  today: string;
  onClose: () => void;
  onOpen: (target: DialogTarget) => void;
};

const ACTION_LABEL: Readonly<Record<DayAction, string>> = {
  "start-here": tx("Period started this day"),
  "end-here": tx("Period ended this day"),
  "edit-period": tx("Edit period"),
  "remove-period": tx("Delete period"),
};

/** What a tapped day is, and what can be done with it. Future days only show what the estimate says. */
export function DayDialog({ date, state, today, onClose, onOpen }: Props) {
  const { t } = useLanguage();
  const colors = useColors();
  const format = useCycleFormat();
  const { addPeriod, updatePeriod } = useCycle();
  const { message, busy, run } = useCycleReport();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const actions = dayActions(state, date, today);
  const kind = useMemo(() => {
    const [year, month] = date.split("-").map(Number);
    const grid = monthGrid(year, month, "mon", state, today);
    return grid.flat().find(day => day.date === date)?.kind ?? "none";
  }, [date, state, today]);
  const period: Period | null = periodAt(state, date, today);

  const perform = async (action: DayAction) => {
    if (action === "edit-period" && period) return onOpen({ kind: "edit", period });
    if (action === "remove-period" && period) return onOpen({ kind: "remove", period });
    const done = await run(() => action === "start-here"
      ? addPeriod({ start: date }, today)
      : updatePeriod(period?.start ?? date, { start: period?.start ?? date, end: date }, today));
    if (done) onClose();
  };

  return <Modal visible transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
    <View style={s.center}>
      <Pressable style={[StyleSheet.absoluteFill, s.scrim]} onPress={onClose} accessible={false} importantForAccessibility="no" />
      <View style={s.card} accessibilityViewIsModal>
        <ScrollView showsVerticalScrollIndicator={false}>
          <Text accessibilityRole="header" style={s.title}>{format.long(date)}</Text>
          <View style={s.kindRow}>
            {isMarked(kind) && <KindSymbol kind={kind} size={12} />}
            <Text style={s.kindText}>{isMarked(kind) ? t(KIND_META[kind].label) : t("No marks on this day")}</Text>
          </View>
          {actions.length === 0 && <Text style={s.note}>{t("Only today and earlier days can be logged. Marks on future days are estimates.")}</Text>}
          {message !== null && <Text accessibilityRole="alert" style={s.error}>{message}</Text>}
          <View style={s.actions}>
            {actions.map(action => <CycleButton key={action} label={t(ACTION_LABEL[action])} busy={busy}
              variant={action === "remove-period" ? "danger" : action === "start-here" ? "primary" : "secondary"}
              onPress={() => { void perform(action); }} />)}
            <CycleButton label={t("Close")} variant="secondary" onPress={onClose} />
          </View>
        </ScrollView>
      </View>
    </View>
  </Modal>;
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  center: { flex: 1, justifyContent: "center", paddingHorizontal: 24, paddingVertical: 24 },
  scrim: { backgroundColor: c.scrim },
  card: { width: "100%", maxWidth: 420, maxHeight: "100%", alignSelf: "center", backgroundColor: c.card, borderRadius: 22, padding: 20 },
  title: { color: c.foreground, fontSize: 18, fontWeight: "800" },
  kindRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 12 },
  kindText: { flexShrink: 1, color: c.foreground, fontSize: 13, fontWeight: "700" },
  note: { color: c.foreground, fontSize: 13, lineHeight: 19, marginBottom: 12 },
  error: { color: c.errorMessage, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  actions: { gap: 8 },
});
