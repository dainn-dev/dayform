import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { durationLabel, timeLabel } from "./planner";
import { extraTranslations } from "./i18n";

export type Language = "en" | "vi";
const translations: Record<string, string> = {
  ...extraTranslations,
  "Good morning": "Chào buổi sáng", "Good afternoon": "Chào buổi chiều", "Good evening": "Chào buổi tối",
  "Make room for what matters.": "Dành thời gian cho điều quan trọng.",
  "YOUR WEEK": "TUẦN CỦA BẠN", "Today": "Hôm nay", "DAILY TIMELINE": "LỊCH TRONG NGÀY", "6 AM – 10 PM": "06:00 – 22:00",
  "WHEN YOU'RE READY": "KHI BẠN SẴN SÀNG", "On your mind": "Việc đang chờ", "View all  →": "Xem tất cả  →",
  "A little breathing room": "Một chút thời gian trống", "Tap any hour to plan something here.": "Chạm vào giờ để thêm việc cần làm.",
  "Outside visible hours": "Ngoài khung giờ hiển thị", "Your backlog is clear. Enjoy the space.": "Không còn việc chờ. Hãy tận hưởng thời gian trống.",
  "THE BIG PICTURE": "GÓC NHÌN TỔNG QUAN", "Your tasks": "Việc của bạn", "Every little thing, all in one place.": "Mọi việc nhỏ, cùng một nơi.",
  "TO DO": "CẦN LÀM", "SCHEDULED": "ĐÃ LÊN LỊCH", "DONE": "HOÀN THÀNH",
  "All tasks": "Tất cả", "Active": "Chưa xong", "Completed": "Đã xong", "Backlog": "Việc chờ", "Scheduled": "Đã lên lịch",
  "Nothing waiting here. Add a task whenever inspiration strikes.": "Chưa có việc chờ. Thêm việc khi bạn sẵn sàng.",
  "No scheduled tasks in this view yet.": "Chưa có việc được lên lịch trong mục này.",
  "Timeline": "Lịch trình", "Tasks": "Công việc", "Focus": "Tập trung", "Work": "Công việc", "Personal": "Cá nhân", "Wellness": "Sức khỏe",
  "YOUR PLANNER": "KẾ HOẠCH CỦA BẠN", "Edit task": "Sửa công việc", "New task": "Việc mới",
  "TASK NAME": "TÊN CÔNG VIỆC", "What needs to get done?": "Bạn cần làm gì?", "DURATION · MIN": "THỜI LƯỢNG · PHÚT", "STATUS": "TRẠNG THÁI",
  "Doing": "Đang làm", "To do": "Cần làm", "Done": "Đã xong", "CATEGORY": "NHÓM",
  "Schedule this task": "Lên lịch công việc", "Otherwise, keep it in your backlog": "Nếu không, giữ trong danh sách chờ",
  "DATE": "NGÀY", "START · 24H": "BẮT ĐẦU · 24H", "NOTES · OPTIONAL": "GHI CHÚ · TÙY CHỌN", "Add a little context...": "Thêm ghi chú...",
  "This overlaps another task. You can save it anyway or choose a new time.": "Trùng giờ với việc khác. Bạn có thể vẫn lưu hoặc chọn giờ khác.",
  "Saving...": "Đang lưu...", "Save anyway": "Vẫn lưu", "Save changes": "Lưu thay đổi", "Add task": "Thêm việc",
  "Tap again to permanently delete": "Chạm lần nữa để xóa vĩnh viễn", "Delete task": "Xóa công việc",
  "Give this task a title.": "Vui lòng nhập tên công việc.", "Duration must be 1–1440 minutes.": "Thời lượng phải từ 1 đến 1440 phút.",
  "Use a valid date: YYYY-MM-DD.": "Nhập ngày hợp lệ theo dạng YYYY-MM-DD.", "Use a 24-hour time: HH:mm.": "Nhập giờ theo dạng 24 giờ: HH:mm.",
  "Scheduled tasks must end before midnight.": "Công việc phải kết thúc trước nửa đêm.",
  "Could not load your saved tasks. Try reopening the app.": "Không thể tải công việc đã lưu. Hãy mở lại ứng dụng.",
  "Your change could not be saved. Please try again.": "Không thể lưu thay đổi. Vui lòng thử lại.",
  "Some saved tasks were damaged and were set aside. The rest were loaded.": "Một số công việc đã lưu bị hỏng và được tách riêng. Các công việc còn lại đã được tải.",
  "Your saved tasks could not be read, so a backup copy was kept and you are starting fresh.": "Không thể đọc các công việc đã lưu nên một bản sao lưu đã được giữ lại và bạn sẽ bắt đầu lại từ đầu.",
  "Some saved tasks could not be backed up, so editing is paused to protect your data. Try reopening the app.": "Không thể sao lưu một số công việc đã lưu, nên việc chỉnh sửa tạm dừng để bảo vệ dữ liệu. Hãy mở lại ứng dụng.",
  "⚠ Overlap": "⚠ Trùng giờ", "⚠ Overlaps another task": "⚠ Trùng giờ với việc khác",
  "Jump to today": "Về hôm nay", "Previous week": "Tuần trước", "Next week": "Tuần sau", "View all tasks": "Xem tất cả công việc",
  "Create a new task": "Tạo công việc mới", "Close task editor": "Đóng trình sửa công việc", "Duration in minutes": "Thời lượng tính bằng phút",
  "Date YYYY-MM-DD": "Ngày YYYY-MM-DD", "Start time 24 hour": "Giờ bắt đầu dạng 24 giờ",
  "Edit": "Sửa", "Complete": "Hoàn thành", "Reopen": "Mở lại", "Schedule": "Lên lịch", "Status": "Trạng thái", "Add task at": "Thêm việc lúc",
};
type LanguageContextValue = {
  language: Language;
  locale: string;
  setLanguage: (language: Language) => void;
  t: (text: string) => string;
  duration: (minutes: number) => string;
  time: (value: string) => string;
  summary: (completed: number, count: number, planned: number) => string;
  languageError: string | null;
};
const LanguageContext = createContext<LanguageContextValue | null>(null);
const KEY = "dayform.language.v1";
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, updateLanguage] = useState<Language>("en");
  const [languageError, setError] = useState<string | null>(null);
  const touched = useRef(false);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    AsyncStorage.getItem(KEY).then(value => {
      if (!touched.current && (value === "en" || value === "vi")) updateLanguage(value);
    }).catch(() => setError("load"));
  }, []);
  const setLanguage = (value: Language) => {
    touched.current = true;
    updateLanguage(value);
    setError(null);
    queue.current = queue.current.then(() => AsyncStorage.setItem(KEY, value)).catch(() => setError("save"));
  };
  const t = (text: string) => language === "vi" ? translations[text] ?? text : text;
  const duration = (value: number) => {
    if (language === "en") return durationLabel(value);
    const h = Math.floor(value / 60), m = value % 60;
    return h ? `${h} giờ${m ? ` ${m} phút` : ""}` : `${m} phút`;
  };
  const time = (value: string) => language === "vi" ? value : timeLabel(value);
  const summary = (completed: number, count: number, planned: number) => language === "vi"
    ? `${completed}/${count} việc đã xong · ${duration(planned)} đã lên lịch`
    : `${completed} of ${count} tasks complete · ${duration(planned)} planned`;
  return <LanguageContext.Provider value={{ language, setLanguage, locale: language === "vi" ? "vi-VN" : "en-US", t, duration, time, summary,
    languageError: languageError ? (language === "vi" ? "Không thể lưu hoặc tải ngôn ngữ trên thiết bị." : "Could not save or load your device language preference.") : null,
  }}>{children}</LanguageContext.Provider>;
}
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage requires LanguageProvider");
  return context;
}