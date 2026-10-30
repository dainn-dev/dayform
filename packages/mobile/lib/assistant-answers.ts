import { dateKey, minutes, type Task } from "./planner";

/**
 * What the assistant says (framework-free, tested). Everything is worked out on the device from the tasks; nothing is
 * sent anywhere. A line is an English text, which is also its translation key (lib/i18n/assistant.ts), plus values for
 * its `{placeholders}`. Task titles are user content and go in as values, never translated.
 */
export type Line = { text: string; vars?: Record<string, string | number> };

export const QUESTION_IDS = ["today", "next", "progress"] as const;
export type QuestionId = (typeof QUESTION_IDS)[number];

export const QUESTIONS: Readonly<Record<QuestionId, string>> = {
  today: "What's on today?",
  next: "What's next?",
  progress: "How am I doing?",
};

export const LINES = {
  greeting: { text: "Oh! You're finally here!" },
  greetingNamed: { text: "Oh! You're finally here, {name}!" },
  listening: { text: "Yes? Ask me something." },
  thinking: { text: "Hmm…" },
  happy: { text: "Nice work! One more done!" },
  angry: { text: "Hey! Stop poking me!" },
  sleepy: { text: "Zzz… tap me to wake me up." },
} as const satisfies Record<string, Line>;

function todayOf(tasks: readonly Task[], now: Date): Task[] {
  const key = dateKey(now);
  return tasks.filter(task => task.date === key);
}

export function greetingLine(name: string): Line {
  const clean = name.trim();
  return clean ? { text: LINES.greetingNamed.text, vars: { name: clean } } : LINES.greeting;
}

/** `formatTime` turns a stored "HH:mm" into the user's 12/24-hour format. */
export function answer(id: QuestionId, tasks: readonly Task[], now: Date, formatTime: (time: string) => string): Line {
  const today = todayOf(tasks, now);
  const done = today.filter(task => task.status === "done").length;
  switch (id) {
    case "today":
      if (today.length === 0) return { text: "Nothing planned today. A free day!" };
      if (today.length === 1) return { text: "You have 1 task today, {done} done.", vars: { done } };
      return { text: "You have {n} tasks today, {done} done.", vars: { n: today.length, done } };
    case "next": {
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const open = today.filter(task => task.status !== "done" && task.start !== null);
      // The one running now or the next to start; a task that ended earlier without being done counts as left over.
      const upcoming = open
        .filter(task => minutes(task.start as string) + task.duration > nowMinutes)
        .sort((a, b) => minutes(a.start as string) - minutes(b.start as string));
      const next = upcoming[0];
      if (next) return { text: "Next: {title} at {time}.", vars: { title: next.title, time: formatTime(next.start as string) } };
      const leftOver = open.length;
      if (leftOver > 0) return { text: "Nothing else is coming up, but {n} earlier tasks are still open.", vars: { n: leftOver } };
      return { text: "Nothing else is planned for today." };
    }
    case "progress":
      if (today.length === 0) return { text: "Nothing to count yet today." };
      if (done === today.length) return { text: "All {n} done! Amazing!", vars: { n: today.length } };
      if (done === 0) return { text: "None of {n} done yet. Let's start with one!", vars: { n: today.length } };
      return { text: "{done} of {n} done. Keep going!", vars: { done, n: today.length } };
  }
}

/** Fills `{placeholders}` after translation; an unknown placeholder stays as it is. */
export function fill(text: string, vars?: Line["vars"]): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/** How long a spoken line stays up, by its length. */
export function talkMs(text: string): number {
  return Math.min(7000, Math.max(2500, 1500 + 55 * text.length));
}
