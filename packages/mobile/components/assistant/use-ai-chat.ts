import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { aiReadiness, type AiReadiness } from "../../lib/ai-config";
import { AiError, streamCompletion } from "../../lib/ai-client";
import { readApiKey } from "../../lib/ai-key-expo";
import { runTurn, trimHistory, type ChatMessage } from "../../lib/ai-loop";
import { systemPrompt, todayContext } from "../../lib/ai-prompt";
import { describeAction, parseToolCall, taskUpdate, type Action, type CategoryRef, type Line } from "../../lib/ai-tools";
import { useCategories } from "../../lib/categories-context";
import { useLanguage } from "../../lib/language";
import { useSettings } from "../../lib/settings-context";
import { useTasks } from "../../lib/tasks-context";
import { useSpecialDays } from "../../lib/special-days-context";

export type ChatEntry =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "assistant"; text: string }
  | { id: string; kind: "confirm"; lines: Line[]; state: "pending" | "approved" | "declined" | "failed" }
  | { id: string; kind: "error"; text: string };

type Callbacks = {
  /** A question went out: Leo starts thinking. */
  onStart: () => void;
  /** The final words of the turn (or what went wrong), for Leo to say. */
  onReply: (text: string) => void;
};

let entrySeq = 0;
const nextId = () => `e${++entrySeq}`;
const newTaskId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * The AI chat of the assistant: the conversation, the confirmation card of every change, and the writes through the
 * app's own paths. All checks and the loop are pure (lib/ai-*.ts); this hook only wires them to the stores.
 */
export function useAiChat({ onStart, onReply }: Callbacks) {
  const { settings, update } = useSettings();
  const { tasks, mutate, undoLast } = useTasks();
  const { visible, label, add: addCategory, rename: renameCategory } = useCategories();
  const { items: specialItems, add: addSpecialDay, remove: removeSpecialDay } = useSpecialDays();
  const { language, setLanguage, time, t } = useLanguage();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [hasKey, setHasKey] = useState(false);
  const history = useRef<ChatMessage[]>([]);
  const abort = useRef<AbortController | null>(null);
  const decisions = useRef(new Map<string, (yes: boolean) => void>());

  // The latest app state, read by tools in the middle of a turn.
  const latest = useRef({ tasks, settings, categories: [] as CategoryRef[] });
  const categories = useMemo(() => visible.map(id => ({ id, name: label(id) })), [visible, label]);
  latest.current = { tasks, settings, categories };
  const latestSpecial = useRef(specialItems);
  latestSpecial.current = specialItems;

  const refreshKey = useCallback(() => { void readApiKey().then(key => setHasKey(key !== null)); }, []);
  useEffect(refreshKey, [refreshKey, settings.ai]);

  const readiness: AiReadiness = aiReadiness(settings.ai, hasKey);

  const patch = (id: string, change: (entry: ChatEntry) => ChatEntry) =>
    setEntries(list => list.map(entry => (entry.id === id ? change(entry) : entry)));

  const confirm = (action: Action): Promise<boolean> => new Promise(resolve => {
    const id = nextId();
    decisions.current.set(id, resolve);
    setEntries(list => [...list, { id, kind: "confirm", lines: describeAction(action, { categories: latest.current.categories, time }), state: "pending" }]);
    pendingCard.current = id;
  });
  const pendingCard = useRef<string | null>(null);

  const answer = useCallback((id: string, yes: boolean) => {
    const resolve = decisions.current.get(id);
    if (!resolve) return;
    decisions.current.delete(id);
    patch(id, entry => (entry.kind === "confirm" ? { ...entry, state: yes ? "approved" : "declined" } : entry));
    resolve(yes);
  }, []);

  const apply = async (action: Action): Promise<boolean> => {
    const change = taskUpdate(action);
    if (change) return mutate(change, { undo: "bulk" });
    if (action.kind === "settings") return (await update(action.changes)).ok;
    if (action.kind === "category-add") return (await addCategory({ name: action.name, color: action.color, icon: action.icon })).ok;
    if (action.kind === "category-rename") return (await renameCategory(action.id, action.name)).ok;
    if (action.kind === "special-add") return (await addSpecialDay(action.input)).ok;
    if (action.kind === "special-remove") return (await removeSpecialDay(action.id)).ok;
    if (action.kind === "undo") return undoLast();
    if (action.kind === "language") {
      setLanguage(action.language);
      return true;
    }
    return false;
  };

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const key = await readApiKey();
    const ready = aiReadiness(latest.current.settings.ai, key !== null);
    setEntries(list => [...list, { id: nextId(), kind: "user", text: question }]);
    if (ready !== "ready" || !key) {
      setEntries(list => [...list, { id: nextId(), kind: "error", text: t("Set up the AI first: base URL, model and API key.") }]);
      return;
    }
    setBusy(true);
    onStart();
    const controller = new AbortController();
    abort.current = controller;
    const { ai, assistant, calendar } = latest.current.settings;
    const now = new Date();
    const lang = language === "vi" ? "vi" : "en";
    const lead: ChatMessage[] = [
      { role: "system", content: systemPrompt({ name: assistant.name, language: lang, now, weekStart: calendar.weekStart }) },
      { role: "system", content: todayContext(latest.current.tasks, now, ai.shareTitles) },
    ];
    const asked: ChatMessage = { role: "user", content: question };
    let streamingId: string | null = null;
    try {
      const result = await runTurn([...lead, ...trimHistory(history.current), asked], {
        cancelled: () => controller.signal.aborted,
        complete: messages => {
          streamingId = null;
          return streamCompletion({ baseUrl: ai.baseUrl, model: ai.model, apiKey: key }, messages, delta => {
            if (streamingId === null) {
              const id = nextId();
              streamingId = id;
              setEntries(list => [...list, { id, kind: "assistant", text: delta }]);
            } else {
              const id = streamingId;
              patch(id, entry => (entry.kind === "assistant" ? { ...entry, text: entry.text + delta } : entry));
            }
          }, controller.signal);
        },
        runTool: async call => {
          const { tasks: currentTasks, settings: currentSettings, categories: currentCategories } = latest.current;
          const parsed = parseToolCall(call, {
            tasks: currentTasks, settings: currentSettings, categories: currentCategories,
            shareTitles: currentSettings.ai.shareTitles, now: new Date(), newId: newTaskId,
            newSeriesId: () => `series-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            specialDays: latestSpecial.current, time,
          });
          if (parsed.kind === "read") return parsed.result;
          if (parsed.kind === "error") return { ok: false, error: parsed.message };
          const agreed = await confirm(parsed.action);
          if (!agreed) return { ok: false, declined: true, error: "The user declined this change." };
          const saved = await apply(parsed.action);
          if (!saved && pendingCard.current) patch(pendingCard.current, entry => (entry.kind === "confirm" ? { ...entry, state: "failed" } : entry));
          return saved ? { ok: true } : { ok: false, error: "The app could not save the change." };
        },
      });
      history.current = [...history.current, asked, ...result.added];
      const reply = result.reply || (result.stopped === "rounds" ? t("Sorry, I could not finish that.") : "");
      if (result.stopped === "rounds") setEntries(list => [...list, { id: nextId(), kind: "error", text: reply }]);
      if (reply) onReply(reply);
    } catch (error) {
      const message = error instanceof AiError ? t(error.message) : t("Could not reach the AI provider.");
      setEntries(list => [...list, { id: nextId(), kind: "error", text: message }]);
      onReply(t("Sorry, something went wrong."));
    } finally {
      // Any card still waiting is declined, so nothing changes after the turn ended.
      for (const [id, resolve] of decisions.current) {
        patch(id, entry => (entry.kind === "confirm" ? { ...entry, state: "declined" } : entry));
        resolve(false);
      }
      decisions.current.clear();
      abort.current = null;
      setBusy(false);
    }
  }, [busy, language, onReply, onStart, t, time]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Stops the turn (closing the chat): pending cards are declined and nothing more is sent. */
  const stop = useCallback(() => {
    abort.current?.abort();
    for (const [, resolve] of decisions.current) resolve(false);
    decisions.current.clear();
  }, []);

  const clear = useCallback(() => {
    stop();
    history.current = [];
    setEntries([]);
  }, [stop]);

  // The card waiting for an answer, so a spoken "yes" or "no" can answer it.
  const pendingConfirm = useMemo(() => {
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i];
      if (entry.kind === "confirm" && entry.state === "pending") return { id: entry.id, lines: entry.lines };
    }
    return null;
  }, [entries]);

  /** Shows a problem in the chat (a failed recording or transcription). */
  const addError = useCallback((text: string) => {
    setEntries(list => [...list, { id: nextId(), kind: "error", text }]);
  }, []);

  return { entries, busy, readiness, send, answer, stop, clear, refreshKey, pendingConfirm, addError };
}
