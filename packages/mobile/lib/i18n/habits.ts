/**
 * Vietnamese strings for habit hints. The English text is the key. "Habit hints" itself lives in personal.ts.
 * Vietnamese has no plural "s", so "{weekday}s" becomes a plain weekday name (the caller passes e.g. "Thứ Ba").
 */
export const vi: Record<string, string> = {
  "Usually {minutes} min": "Thường {minutes} phút",
  "Based on {count} similar tasks": "Dựa trên {count} việc tương tự",
  "Use {minutes} min": "Dùng {minutes} phút",
  "You usually do this on {weekday}s": "Bạn thường làm việc này vào {weekday}",
  "You do this most weekdays": "Bạn làm việc này hầu hết các ngày trong tuần",
  "You do this every day": "Bạn làm việc này mỗi ngày",
  "Make it repeat": "Đặt lặp lại",
  "You finish most tasks between {from} and {to}": "Bạn hoàn thành phần lớn công việc từ {from} đến {to}",
  "Based on your last 8 weeks": "Dựa trên 8 tuần gần nhất của bạn",
  "{count} tasks have been waiting over {days} days": "{count} việc đã chờ hơn {days} ngày",
  "Review them": "Xem lại",
};
