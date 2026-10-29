# Source code Dayform — Expo SDK 57

Gồm source mobile (EN/VI), web/API và desktop của monorepo. App planner lưu dữ liệu trên thiết bị, không cần backend.

## Chạy trên máy cá nhân

Cài Bun và Node.js tương thích Expo SDK 57, giải nén ZIP, mở terminal tại thư mục dayform.

```sh
bun install --linker hoisted
```

Sau đó mở terminal tại packages/mobile và chạy:

```sh
bunx expo start
```

Điện thoại và máy tính cần cùng mạng Wi-Fi; dùng Expo Go cho SDK 57. Trên iPhone cần development build hoặc Expo Go SDK 57 qua TestFlight.

Script `bun run dev:mobile` ở thư mục gốc dành cho preview Runable: nó yêu cầu EXPO_PACKAGER_PROXY_URL. Khi chạy máy cá nhân, dùng `bunx expo start` trong packages/mobile như trên, không dùng URL sandbox cũ.

## Lưu ý

- Không kèm .env, API key, token, chứng chỉ, node_modules, cache hoặc build output.
- Giao diện/code mobile: packages/mobile/app và packages/mobile/components.
- Ngôn ngữ: packages/mobile/lib/language.tsx.
- SDK/dependency: packages/mobile/package.json và bun.lock.
- Expo Doctor còn cảnh báo React 19.2.3 (mobile) và React 19.1.0 (web) trong cùng monorepo.
- URL Runable công khai và mã ứng dụng vẫn ở config gốc; khi đưa lên môi trường riêng, cần cấu hình lại tài khoản/project Expo và các dịch vụ nếu sử dụng.
- ZIP là source code, không phải APK.
