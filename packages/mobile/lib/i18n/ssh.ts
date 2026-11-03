/**
 * Vietnamese strings for the SSH servers page (components/personal/SshSection.tsx, SshHostEditor.tsx, lib/ssh.ts). The
 * English text is the key. "Name", "Save", "Cancel" and "Tap again to delete" are translated elsewhere.
 */
export const vi: Record<string, string> = {
  // Menu
  "SSH servers": "Máy chủ SSH",
  "No servers": "Chưa có máy chủ",
  "1 server": "1 máy chủ",
  "{count} servers": "{count} máy chủ",

  // Page
  "Log in to your own servers over SSH. Each server's key is shown to you first and checked on every connection.":
    "Đăng nhập vào máy chủ của bạn qua SSH. Khóa của máy chủ được cho bạn xem trước và được kiểm tra ở mọi lần kết nối.",
  "No servers yet. Add one below.": "Chưa có máy chủ nào. Hãy thêm ở bên dưới.",
  "Add a server": "Thêm máy chủ",
  "Key not checked yet": "Chưa kiểm tra khóa",
  "Trusted key": "Khóa đã tin",
  "Is this your server's key?": "Đây có đúng là khóa của máy chủ bạn không?",
  "Compare it with what the server shows: ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub":
    "Hãy so với giá trị máy chủ hiển thị: ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub",
  "Trust and log in": "Tin và đăng nhập",
  "Connected. The login works.": "Đã kết nối. Đăng nhập hoạt động.",
  "Forget the old key": "Quên khóa cũ",
  "Connecting…": "Đang kết nối…",
  "Check connection": "Kiểm tra kết nối",
  "Run a command": "Chạy lệnh",

  // The assistant
  "Let the assistant run commands": "Cho trợ lý chạy lệnh",
  "The assistant can propose a command on a trusted server. You see the exact command and must agree to each one. A command that looks dangerous needs a tap on the card; it cannot be agreed to by voice.":
    "Trợ lý có thể đề xuất một lệnh trên máy chủ đã tin. Bạn thấy đúng lệnh đó và phải đồng ý từng lệnh. Lệnh trông nguy hiểm phải chạm vào thẻ, không đồng ý bằng giọng nói được.",
  "Turn on the AI chat on the Assistant page for this to work.": "Hãy bật trò chuyện AI ở trang Trợ lý để tính năng này hoạt động.",
  "Send command output to the AI": "Gửi đầu ra của lệnh cho AI",
  "Off: the assistant only learns whether a command worked, and you read the output yourself. On: up to 8000 characters of each output go to your AI provider, so leave it off for servers whose output can hold secrets.":
    "Tắt: trợ lý chỉ biết lệnh có chạy được không, còn đầu ra bạn tự đọc. Bật: tối đa 8000 ký tự của mỗi đầu ra được gửi cho nhà cung cấp AI của bạn, nên hãy để tắt với máy chủ có đầu ra chứa bí mật.",
  "Run on server {host}:": "Chạy trên máy chủ {host}:",
  "{command}": "{command}",
  "It runs several commands in a row.": "Lệnh này chạy nhiều lệnh nối tiếp nhau.",
  "Careful, this command may be dangerous:": "Cẩn thận, lệnh này có thể nguy hiểm:",
  "It deletes files, possibly a whole folder.": "Nó xóa tệp, có thể cả một thư mục.",
  "It writes straight to a disk or changes its partitions.": "Nó ghi thẳng vào ổ đĩa hoặc đổi phân vùng.",
  "It shuts down or restarts the server.": "Nó tắt hoặc khởi động lại máy chủ.",
  "It stops or disables a service.": "Nó dừng hoặc vô hiệu hóa một dịch vụ.",
  "It forcibly stops processes.": "Nó buộc dừng các tiến trình.",
  "It changes permissions or owners of a whole folder.": "Nó đổi quyền hoặc chủ sở hữu của cả thư mục.",
  "It runs a script downloaded from the internet.": "Nó chạy một tập lệnh tải từ internet.",
  "It deletes a database, a table or all its rows.": "Nó xóa cơ sở dữ liệu, một bảng hoặc mọi dòng của bảng.",
  "It removes containers, images or their data.": "Nó xóa container, ảnh hoặc dữ liệu của chúng.",
  "It discards work or rewrites history.": "Nó bỏ công việc chưa lưu hoặc viết lại lịch sử.",
  "It overwrites a system configuration file.": "Nó ghi đè tệp cấu hình hệ thống.",
  "It looks like a fork bomb that would freeze the server.": "Trông giống một fork bomb làm treo máy chủ.",
  "This one needs a tap: press Agree on the card.": "Lệnh này cần chạm: hãy bấm Đồng ý trên thẻ.",

  // Terminal
  "Type a command and press Run. Each command is run on its own, so a cd does not carry over to the next one.":
    "Gõ một lệnh rồi bấm Chạy. Mỗi lệnh chạy riêng, nên lệnh cd không giữ sang lệnh sau.",
  "The output was longer than {size} KB; the end was cut.": "Đầu ra dài hơn {size} KB; phần cuối đã bị cắt.",
  "Stopped after {seconds} seconds.": "Đã dừng sau {seconds} giây.",
  "Exit code": "Mã thoát",
  "Use this command": "Dùng lệnh này",
  "Clear the command history": "Xóa lịch sử lệnh",
  "Command": "Lệnh",
  "Run": "Chạy",
  "Running…": "Đang chạy…",
  "The history keeps the commands, not their output. Do not type a password into a command: it would be kept.":
    "Lịch sử chỉ giữ lệnh, không giữ đầu ra. Đừng gõ mật khẩu vào lệnh: nó sẽ bị lưu lại.",

  // Editor
  "New server": "Máy chủ mới",
  "Edit server": "Sửa máy chủ",
  "Delete server": "Xóa máy chủ",
  "Address": "Địa chỉ",
  "Port": "Cổng",
  "User": "Người dùng",
  "Log in with": "Đăng nhập bằng",
  "Private key": "Khóa riêng",
  "Password": "Mật khẩu",
  "Choose a key file": "Chọn tệp khóa",
  "Key passphrase (if it has one)": "Mật khẩu của khóa (nếu có)",
  "A key is saved. Leave empty to keep it.": "Đã lưu một khóa. Để trống để giữ nguyên.",
  "A password is saved. Leave empty to keep it.": "Đã lưu một mật khẩu. Để trống để giữ nguyên.",
  "The password or key stays in your phone's secure storage. It is never saved in a backup and never sent to the assistant.":
    "Mật khẩu hoặc khóa chỉ nằm trong kho bảo mật của điện thoại. Chúng không bao giờ vào bản sao lưu và không bao giờ gửi cho trợ lý.",
  "Give the server a name.": "Hãy đặt tên cho máy chủ.",
  "Enter a host name or an IP address, without ssh:// or a port.": "Hãy nhập tên máy chủ hoặc địa chỉ IP, không kèm ssh:// hay cổng.",
  "The port must be a number from 1 to 65535.": "Cổng phải là số từ 1 đến 65535.",
  "Enter the user name to log in with.": "Hãy nhập tên người dùng để đăng nhập.",
  "Another server already has this name.": "Đã có máy chủ khác mang tên này.",
  "You have reached the maximum number of servers.": "Bạn đã có số máy chủ tối đa.",
  "That server no longer exists.": "Máy chủ này không còn nữa.",
  "Servers could not be loaded, so they cannot be changed now. Try reopening the app.": "Không đọc được danh sách máy chủ nên chưa thể thay đổi. Hãy mở lại ứng dụng.",
  "Enter the password, or the private key, to save with this server.": "Hãy nhập mật khẩu hoặc khóa riêng để lưu cùng máy chủ này.",
  "That does not look like a private key. Paste the whole file, from the BEGIN line to the END line.":
    "Nội dung này không giống một khóa riêng. Hãy dán cả tệp, từ dòng BEGIN đến dòng END.",
  "The server was saved, but its password or key could not be stored on this phone.": "Đã lưu máy chủ, nhưng không cất được mật khẩu hoặc khóa vào điện thoại.",
  "That file could not be read.": "Không đọc được tệp này.",

  // Failures (lib/ssh.ts)
  "This server's key is not trusted yet. Check its fingerprint first.": "Khóa của máy chủ này chưa được tin. Hãy kiểm tra dấu vân tay trước.",
  "The server's key is not the one you trusted. Someone may be intercepting the connection, or the server was reinstalled. Nothing was sent.":
    "Khóa của máy chủ không phải khóa bạn đã tin. Có thể ai đó đang chặn kết nối, hoặc máy chủ đã được cài lại. Chưa có gì được gửi đi.",
  "The server refused the login. Check the user name and the password or key.": "Máy chủ từ chối đăng nhập. Hãy kiểm tra tên người dùng và mật khẩu hoặc khóa.",
  "The private key could not be read. Check its format and its passphrase.": "Không đọc được khóa riêng. Hãy kiểm tra định dạng và mật khẩu của khóa.",
  "The server did not answer in time.": "Máy chủ không trả lời kịp.",
  "The server and the app have no encryption method in common.": "Máy chủ và ứng dụng không có phương thức mã hóa chung.",
  "Could not connect. Check the address, the port and your network.": "Không kết nối được. Hãy kiểm tra địa chỉ, cổng và mạng.",
  "The command is empty or too long.": "Lệnh trống hoặc quá dài.",
  "No password or key is saved for this server.": "Chưa lưu mật khẩu hay khóa cho máy chủ này.",
  "SSH is not available in this build of the app.": "Bản ứng dụng này không có SSH.",
};
