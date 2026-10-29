import { fillPlaceholders } from "../text-template";

/** Vietnamese strings for notification texts and the Notifications card. The English text is the key. */
export const vi: Record<string, string> = {
  // Notification text (also read by lib/reminders.ts and lib/summary-notification.ts through `localize`)
  "Upcoming task": "Việc sắp tới",
  "Today you have 1 task": "Hôm nay bạn có 1 việc",
  "Today you have {n} tasks": "Hôm nay bạn có {n} việc",
  "First: {title} · {time}": "Đầu tiên: {title} · {time}",
  "First task at {time}": "Việc đầu tiên lúc {time}",
  // Notifications card
  "Quiet hours": "Giờ yên tĩnh",
  "Reminders inside this window wait until it ends.": "Nhắc nhở rơi vào khoảng này sẽ chờ đến khi kết thúc.",
  "QUIET FROM": "TỪ",
  "QUIET UNTIL": "ĐẾN",
  "Quiet hours start": "Bắt đầu giờ yên tĩnh",
  "Quiet hours end": "Kết thúc giờ yên tĩnh",
  "Hide task titles in notifications": "Ẩn tên việc trong thông báo",
  "Notifications say \"Upcoming task\" instead of the title.": "Thông báo hiện \"Việc sắp tới\" thay vì tên việc.",
  "SNOOZE LENGTH": "THỜI GIAN BÁO LẠI",
  "{n} min": "{n} phút",
  "Morning summary": "Tóm tắt buổi sáng",
  "A daily note with how many tasks you have today.": "Mỗi ngày một thông báo cho biết hôm nay bạn có bao nhiêu việc.",
  "SUMMARY TIME": "GIỜ TÓM TẮT",
  "Summary time": "Giờ tóm tắt",
  "Notifications are off, so these options have no effect yet.": "Thông báo đang tắt nên các tùy chọn này chưa có tác dụng.",
  "Allow notifications": "Cho phép thông báo",
};

/** Notification text for `language`: the Vietnamese entry when there is one, else the English key; fills `{name}` values. */
export function localize(language: "en" | "vi", key: string, values: Readonly<Record<string, string>> = {}): string {
  const text = language === "vi" ? vi[key] ?? key : key;
  return fillPlaceholders(text, values);
}
