import { normalizeText } from "./search";
import type { QuickAddPlan } from "./quick-add-plan";
import { addDays, type Category, type Repeat } from "./planner";
import type { SaveForm } from "./task-save";

/**
 * Adding a task by talking to the assistant when the AI chat is off (framework-free, tested). The sentence is read by
 * the quick add parser on the device; nothing is sent anywhere. Here: is the sentence a request to add something, and
 * how is the proposed task read out and shown before the user agrees.
 */

/** Words that may come first ("Leo ơi giúp mình thêm ..."). */
const LEADING = ["hay", "giup", "giup toi", "giup minh", "cho toi", "cho minh", "vui long", "lam on", "please", "can you", "could you", "help me", "i want to", "toi muon", "minh muon", "toi can", "minh can"];
/** The request itself. Longest first, so "nhac toi" wins over "nhac". */
const VERBS = ["them vao", "them", "tao", "dat lich", "len lich", "ghi lai", "ghi", "nhac toi", "nhac minh", "nhac", "add", "create", "make", "schedule", "remind me to", "remind me", "set up", "put"];
/** What is added, said before the title ("thêm việc họp" → "họp"). */
const NOUNS = ["mot viec", "cong viec", "viec", "task", "a task", "an event", "event", "a reminder", "reminder", "nhac nho", "lich", "cuoc hop", "to", "that"];
/** Question openers: a sentence that starts with one asks, it does not add. */
const QUESTION_START = ["khi nao", "may gio", "bao nhieu", "la gi", "co gi", "co nhung", "what", "when", "how", "which", "who", "is there", "do i", "am i"];

export type AddRequest = {
  /** An add verb opened the sentence ("thêm", "nhắc tôi", "remind me to"). */
  explicit: boolean;
  /** The sentence without the verb, ready for the quick add parser. */
  text: string;
  questionLike: boolean;
};

function dropPhrase(normal: string[], phrases: readonly string[]): number {
  // The longest phrase first, so "giup minh" is taken whole and not as "giup" plus a stray word.
  for (const phrase of [...phrases].sort((a, b) => b.split(" ").length - a.split(" ").length)) {
    const parts = phrase.split(" ");
    if (parts.every((part, i) => normal[i] === part)) return parts.length;
  }
  return 0;
}

/** Reads the start of a sentence. The text keeps the user's own words and accents (only the verb part is cut off). */
export function readAddRequest(transcript: string): AddRequest {
  const original = transcript.trim().split(/\s+/).filter(Boolean);
  const normal = original.map(word => normalizeText(word.replace(/[^\p{L}\p{N}]/gu, "")));
  let at = 0;
  at += dropPhrase(normal.slice(at), LEADING);
  const verb = dropPhrase(normal.slice(at), VERBS);
  const explicit = verb > 0;
  if (explicit) {
    at += verb;
    at += dropPhrase(normal.slice(at), NOUNS);
  } else {
    at = 0;
  }
  const questionLike = /\?\s*$/.test(transcript.trim()) || dropPhrase(normal, QUESTION_START) > 0;
  return { explicit, text: original.slice(at).join(" ").replace(/^[,.:;!\s]+|[\s.!?]+$/g, "").trim(), questionLike };
}

/**
 * Whether to treat a heard sentence as "add this". An explicit verb is enough. Without one the sentence must have been
 * read as scheduled (a day or a time) and not be a question, so "lịch hôm nay?" is a question and "họp nhóm 3pm mai" is a task.
 */
export function shouldAdd(request: AddRequest, plan: QuickAddPlan): boolean {
  if (plan.plan === null || plan.form === null) return false;
  if (request.explicit) return true;
  return !request.questionLike && plan.parsed.date !== null;
}

export type DescribeContext = {
  today: string;
  t: (text: string) => string;
  /** `HH:mm` in the user's format. */
  time: (value: string) => string;
  duration: (minutes: number) => string;
  /** A date key as a short weekday and date in the user's language. */
  date: (key: string) => string;
  category: (id: Category) => string;
};

const REPEAT_TEXT: Record<Repeat, string> = { daily: "Every day", weekdays: "Weekdays", weekly: "Every week", monthly: "Every month" };

/** The parts of the proposed task, in the order they are read: when, how long, repeat, category. */
export function describeParts(form: SaveForm, ctx: DescribeContext): string[] {
  const parts: string[] = [];
  if (form.scheduled) {
    const day = form.date === ctx.today ? ctx.t("Today") : form.date === addDays(ctx.today, 1) ? ctx.t("Tomorrow") : ctx.date(form.date);
    parts.push(`${day} ${ctx.time(form.time)}`);
  } else {
    parts.push(ctx.t("On your mind"));
  }
  parts.push(ctx.duration(form.duration));
  if (form.repeat !== null) parts.push(ctx.t(REPEAT_TEXT[form.repeat]));
  parts.push(ctx.category(form.category));
  return parts;
}

/** What the assistant says before asking for a yes: the title, then the parts. */
export function spokenProposal(title: string, parts: readonly string[], question: string): string {
  return `${title}. ${parts.join(", ")}. ${question}`;
}
