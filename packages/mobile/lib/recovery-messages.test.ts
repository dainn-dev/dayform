import { describe, test, expect } from "bun:test";
import {
  LIST_FAILED_MESSAGE,
  deleteNotice,
  formatBytes,
  SNAPSHOTS_PAUSED_MESSAGE,
  itemActionLabel,
  itemLine,
  kindLabel,
  previewSummaryParts,
  restoreErrorMessage,
  restoredNotice,
  summaryLine,
  type RestoreFailure,
} from "./recovery-messages";
import { formatNotice, type ImportSummary } from "./backup-flow";
import { vi } from "./i18n/recovery";
import { vi as backupVi } from "./i18n/backup";
import type { RecoveryItem } from "./recovery";

const item = (overrides: Partial<RecoveryItem> = {}): RecoveryItem => ({
  key: "dayform.tasks.backup.a",
  kind: "backup",
  label: "a",
  date: null,
  bytes: 10,
  unreadable: false,
  ...overrides,
});

const identity = (text: string) => text;
const summary = (overrides: Partial<ImportSummary> = {}): ImportSummary => ({
  found: 5,
  skipped: 0,
  added: 2,
  updated: 1,
  unchanged: 2,
  removed: 0,
  resulting: 5,
  ...overrides,
});

describe("formatBytes", () => {
  test("uses B, KB and MB with one decimal (decimal units)", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1000)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(999_949)).toBe("999.9 KB");
    expect(formatBytes(1_500_000)).toBe("1.5 MB");
  });

  test("never renders 1000.0 KB: a size that rounds up to 1000 KB is shown in MB", () => {
    expect(formatBytes(999_950)).toBe("1.0 MB");
    expect(formatBytes(999_999)).toBe("1.0 MB");
    expect(formatBytes(1_000_000)).toBe("1.0 MB");
    expect(formatBytes(999_900)).toBe("999.9 KB");
  });

  test("treats negative, fractional and non-finite sizes as 0 B or whole bytes", () => {
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
    expect(formatBytes(12.7)).toBe("12 B");
  });
});

describe("kindLabel", () => {
  test("has a distinct English label per kind", () => {
    const labels = [kindLabel("backup"), kindLabel("corrupt"), kindLabel("snapshot")];
    expect(new Set(labels).size).toBe(3);
  });
});

describe("itemLine", () => {
  test("shows the size of a readable copy and says so when it could not be read", () => {
    expect(itemLine(item({ bytes: 1536 }), identity)).toBe("1.5 KB");
    expect(itemLine(item({ bytes: 0, unreadable: true }), identity)).toBe("Could not read this copy.");
    expect(itemLine(item({ unreadable: true }), text => `<${text}>`)).toBe("<Could not read this copy.>");
  });
});

describe("previewSummaryParts", () => {
  const parsedOf = (count: number, rejected = 0) => ({
    tasks: Array.from({ length: count }, (_, i) => ({ id: String(i) }) as never),
    rejected,
  });

  test("uses singular and plural keys with the count first", () => {
    expect(formatNotice(previewSummaryParts(parsedOf(1)), identity)).toBe("1 task in this copy");
    expect(formatNotice(previewSummaryParts(parsedOf(0)), identity)).toBe("0 tasks in this copy");
    expect(formatNotice(previewSummaryParts(parsedOf(12)), identity)).toBe("12 tasks in this copy");
  });

  test("adds skipped records, singular and plural", () => {
    expect(formatNotice(previewSummaryParts(parsedOf(2, 1)), identity)).toBe("2 tasks in this copy, 1 task skipped");
    expect(formatNotice(previewSummaryParts(parsedOf(0, 4)), identity)).toBe("0 tasks in this copy, 4 tasks skipped");
  });
});

describe("itemActionLabel", () => {
  test("names the action and the copy, so a screen reader can tell the rows apart", () => {
    const snapshot = item({ kind: "snapshot", label: "2026-10-29", key: "dayform.snapshot.2026-10-29", date: "2026-10-29" });
    expect(itemActionLabel("Restore (merge)", snapshot, identity)).toBe("Restore (merge): Automatic snapshot 2026-10-29");
    expect(itemActionLabel("Delete", item({ label: "1a2b-30" }), identity)).toBe("Delete: Copy of unreadable data 1a2b-30");
  });

  test("translates the action and the kind", () => {
    expect(itemActionLabel("Preview", item({ label: "x" }), text => text.toUpperCase())).toBe("PREVIEW: COPY OF UNREADABLE DATA x");
  });
});

describe("summaryLine", () => {
  test("labels each count and only mentions removals when there are some", () => {
    expect(summaryLine(summary(), identity)).toBe("Added: 2  ·  Updated: 1  ·  Unchanged: 2");
    expect(summaryLine(summary({ removed: 3 }), identity)).toBe("Added: 2  ·  Updated: 1  ·  Unchanged: 2  ·  Removed: 3");
  });

  test("translates the labels", () => {
    expect(summaryLine(summary(), text => `<${text}>`)).toBe("<Added>: 2  ·  <Updated>: 1  ·  <Unchanged>: 2");
  });
});

describe("restoreErrorMessage", () => {
  test("has a distinct, non-empty message for every failure", () => {
    const reasons: RestoreFailure[] = [
      "not-recovery-key",
      "read-failed",
      "missing",
      "unreadable-copy",
      "newer-version",
      "copy-too-large",
      "too-many-tasks",
      "too-large",
      "no-valid-tasks",
      "save-failed",
      "safety-copy-failed",
      "list-changed",
    ];
    const messages = reasons.map(restoreErrorMessage);
    expect(messages.every(message => message.length > 0)).toBe(true);
    expect(new Set(messages).size).toBe(reasons.length);
  });
});

describe("restoredNotice with categories", () => {
  test("mentions categories only when they failed to apply", () => {
    const base = summary({ added: 1, updated: 0 });
    expect(formatNotice(restoredNotice(base, "failed").parts, identity)).toBe("1 task restored, Categories could not be restored");
    expect(formatNotice(restoredNotice(base, "applied").parts, identity)).toBe("1 task restored");
  });
});

describe("restoredNotice", () => {
  test("counts added and updated tasks as restored, with the right number form", () => {
    expect(formatNotice(restoredNotice(summary({ added: 1, updated: 0 })).parts, identity)).toBe("1 task restored");
    expect(formatNotice(restoredNotice(summary({ added: 2, updated: 1 })).parts, identity)).toBe("3 tasks restored");
    expect(restoredNotice(summary()).tone).toBe("success");
  });

  test("mentions skipped records", () => {
    expect(formatNotice(restoredNotice(summary({ added: 2, updated: 0, skipped: 1 })).parts, identity)).toBe("2 tasks restored, 1 task skipped");
  });
});

describe("deleteNotice", () => {
  const result = (outcome: "deleted" | "refused" | "failed") => ({ key: "k", outcome });

  test("success when everything was deleted", () => {
    const notice = deleteNotice([result("deleted")]);
    expect(notice.tone).toBe("success");
    expect(formatNotice(notice.parts, identity)).toBe("1 copy deleted");
    expect(formatNotice(deleteNotice([result("deleted"), result("deleted")]).parts, identity)).toBe("2 copies deleted");
  });

  test("error when something could not be deleted, mentioning both counts when mixed", () => {
    const allFailed = deleteNotice([result("failed")]);
    expect(allFailed.tone).toBe("error");
    expect(formatNotice(allFailed.parts, identity)).toBe("1 copy could not be deleted");
    const mixed = deleteNotice([result("deleted"), result("failed"), result("refused")]);
    expect(mixed.tone).toBe("error");
    expect(formatNotice(mixed.parts, identity)).toBe("1 copy deleted, 2 copies could not be deleted");
  });

  test("an empty request is a success with zero copies", () => {
    expect(formatNotice(deleteNotice([]).parts, identity)).toBe("0 copies deleted");
  });
});

describe("Vietnamese dictionary", () => {
  const usedKeys = [
    "Data recovery",
    "No recovery copies",
    "Preview",
    "Hide preview",
    "Restore (merge)",
    "Restore (replace)",
    "Delete",
    "Delete all recovery copies",
    "Show recovery copies",
    "Hide recovery copies",
    "Refresh",
    SNAPSHOTS_PAUSED_MESSAGE,
    "Copies of data that could not be read are kept here, together with automatic snapshots, so nothing is lost.",
    "Try again",
    "Replace all your current tasks with this copy?",
    "Delete this copy for good?",
    "Delete every recovery copy for good?",
    "Yes, delete",
    LIST_FAILED_MESSAGE,
    kindLabel("backup"),
    kindLabel("corrupt"),
    kindLabel("snapshot"),
    "task in this copy",
    "tasks in this copy",
    "task restored",
    "tasks restored",
    "copy deleted",
    "copies deleted",
    "copy could not be deleted",
    "copies could not be deleted",
  ];

  test("translates every key this feature introduces, with proper diacritics", () => {
    for (const key of usedKeys) {
      expect(vi[key]).toBeDefined();
      expect(vi[key]).not.toBe(key);
    }
  });

  test("every restore error not already translated by the backup feature is in the recovery dictionary", () => {
    const reasons: RestoreFailure[] = [
      "not-recovery-key", "read-failed", "missing", "unreadable-copy", "newer-version", "copy-too-large",
      "too-many-tasks", "too-large", "no-valid-tasks", "save-failed", "safety-copy-failed", "list-changed",
    ];
    for (const reason of reasons) {
      const message = restoreErrorMessage(reason);
      expect(vi[message] ?? backupVi[message]).toBeDefined();
    }
  });
});
