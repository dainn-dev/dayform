import { fillPlaceholders } from "../text-template";

/**
 * Notification text, backup warnings and recovery labels of the private period tracker. The English text is the
 * key. Notification wording is neutral by default (the user can switch to plain wording), and the labels shown in
 * Settings never name the feature ("personal data"); only the export warning says "health data" on purpose.
 */
export const CYCLE_NOTIFICATION_TITLE = "Dayform";
export const NEUTRAL_BODY = "Dayform: personal reminder";
export const CHANNEL_NAME = "Personal reminders";

export const vi: Record<string, string> = {
  // Notification text
  "Dayform: personal reminder": "Dayform: nhắc nhở cá nhân",
  "Period expected today": "Kỳ kinh dự kiến bắt đầu hôm nay",
  "Period expected tomorrow": "Kỳ kinh dự kiến bắt đầu ngày mai",
  "Period expected in {n} days": "Kỳ kinh dự kiến bắt đầu sau {n} ngày",
  "Period may be late": "Kỳ kinh có thể đến trễ",
  "Fertile window may start today (estimate)": "Giai đoạn dễ thụ thai có thể bắt đầu hôm nay (ước tính)",
  "Personal reminders": "Nhắc nhở cá nhân",
  // Backup and recovery
  "This file includes health data (period tracker) and is not encrypted. Share it only with people you trust.":
    "Tệp này có dữ liệu sức khỏe (theo dõi kỳ kinh) và không được mã hóa. Chỉ chia sẻ cho người bạn tin tưởng.",
  "Personal data could not be restored": "Không thể khôi phục dữ liệu cá nhân",
  "Personal data restored": "Đã khôi phục dữ liệu cá nhân",
  "Personal data that could not be read": "Dữ liệu cá nhân không đọc được",
  "Includes personal data": "Có dữ liệu cá nhân",
  "Replace all your current personal data with this copy?": "Thay thế toàn bộ dữ liệu cá nhân hiện tại bằng bản sao này?",
};

/** Text for `language`: the Vietnamese entry when there is one, else the English key; fills `{name}` values. */
export function localizeCycle(language: "en" | "vi", key: string, values: Readonly<Record<string, string>> = {}): string {
  const text = language === "vi" ? vi[key] ?? key : key;
  return fillPlaceholders(text, values);
}
