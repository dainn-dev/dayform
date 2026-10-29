/**
 * Vietnamese strings of the period tracker's privacy rules: the check before export, import and restore, the wording
 * of the confirmations that carry tracker data, and what "delete all" removes. The English text is the key.
 * Wording outside the tracker screen stays neutral ("personal data") except where the backup file itself is named.
 */
export const vi: Record<string, string> = {
  // The check before an export, import or restore that touches the tracker
  "Could not confirm it is you, so nothing was changed.": "Không thể xác nhận đó là bạn, nên chưa có gì bị thay đổi.",
  "Confirm it is you to continue": "Xác nhận đó là bạn để tiếp tục",
  // Import and restore confirmations
  "This file also has period tracker data.": "Tệp này cũng có dữ liệu theo dõi kỳ kinh.",
  "Replace all your current tasks and your period tracker history?":
    "Thay thế toàn bộ công việc hiện tại và lịch sử theo dõi kỳ kinh của bạn?",
  "Replace your current period tracker history?": "Thay thế lịch sử theo dõi kỳ kinh hiện tại của bạn?",
  "Replace all your current tasks and personal data with this copy?":
    "Thay thế toàn bộ công việc và dữ liệu cá nhân hiện tại bằng bản sao này?",
  // Delete all
  "It is also removed from the automatic copies kept on this device. A backup file you exported earlier is not deleted.":
    "Dữ liệu cũng bị xóa khỏi các bản sao tự động trên thiết bị. Tệp sao lưu bạn đã xuất trước đó không bị xóa.",
  "Your data was deleted, but some automatic copies on this device could not be cleaned. Try again.":
    "Dữ liệu đã được xóa, nhưng một số bản sao tự động trên thiết bị chưa dọn được. Hãy thử lại.",
};
