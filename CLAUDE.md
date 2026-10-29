# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Dayform is a local-first weekly planner. The product is the Expo SDK 57 app in `packages/mobile`. The repo is a Bun + Turborepo monorepo generated from a Runable template, so `packages/web` (Vite + Hono + oRPC + Drizzle) and `packages/desktop` (Electron shell around web) are template scaffolding that the app does not use for task storage. Don't build features there unless asked.

## Commands

Run from the repo root unless noted. Bun is the package manager (`bun@1.3.14`).

```bash
bun install --linker hoisted        # hoisted linker is required; Metro resolves from root node_modules
bun run typecheck                   # turbo → tsc --noEmit in each package
bun run lint                        # runkit lint (oxlint); lint:fix to autofix
bun run build                       # turbo build (web: tsc + vite build)
```

- **Run the mobile app locally:** `cd packages/mobile && bunx expo start`. The root `bun run dev:mobile` only works inside Runable: `scripts/start-mobile.ts` throws unless `EXPO_PACKAGER_PROXY_URL` is an `https://` URL.
- **Tests:** `cd packages/mobile && bun test` (`bun test lib/tasks-store.test.ts` for one file, `--coverage` for coverage). They cover the framework-free modules in `lib/` (`planner`, `task-storage`, `tasks-store`, `timeline-layout`). There are no component/UI tests, so screen changes need manual verification. Keep logic that needs tests out of React files and in those pure modules.
- **Typecheck:** mobile's `typecheck` runs two programs: `tsc --noEmit` for the app (`tsconfig.json`, `"types": []`, test files excluded) and `tsc --noEmit -p tsconfig.test.json` for `lib/**/*.test.ts` (adds `bun` types). Don't put `bun`/Node types in the app program: they make `setTimeout` return `Timeout` instead of `number` and clash with `__env.d.ts`'s `process`. Root and web use TypeScript `7.0.1-rc`; mobile uses `~6.0.3` (TS 6 no longer auto-loads `@types/*`).
- The root `bun run lint` needs `@runablehq/runkit`, which a filtered install (`bun install --filter ...`) skips; do a full `bun install --linker hoisted` first.
- Expo Doctor warns about React 19.2.3 (mobile) vs 19.1.0 (web) in one monorepo. This is a known warning noted in `DOWNLOAD-README-VI.md`.

### Building an Android APK locally

`packages/mobile/android/` is generated and gitignored. It does not exist until you prebuild. `eas.json` has no `apk` profile, so EAS cloud builds produce AABs by default.

```bash
cd packages/mobile
bunx expo prebuild --platform android --no-install
cd android && ./gradlew assembleRelease     # → app/build/outputs/apk/release/app-release.apk
# faster, arm64 phones only:  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
```

**Windows path-length trap:** a build from a deep path fails in the native step with `ninja: error: ... Filename longer than 260 characters` (seen on `react-native-gesture-handler`'s codegen objects). A `subst` drive does NOT fix it (the path is still ~318 chars, and Metro cannot resolve `expo-router/entry` through a `subst` drive), and `CMAKE_OBJECT_PATH_MAX` doesn't help either (the build directory itself is too long). Instead, `packages/mobile/package.json` sets `expo.autolinking.exclude` for `react-native-gesture-handler`, `react-native-reanimated` and `react-native-worklets`, which the app doesn't use (expo-router only needs them for the opt-in `expo-router/js-stack`; this app uses `Slot` + `Tabs`). **Don't import those libraries or `expo-router/js-stack` without first removing them from that list and solving the long-path problem** (Windows long paths + a newer ninja/CMake, or build on Linux/EAS). The planned timeline drag-and-drop should use React Native's built-in `PanResponder` for this reason.

Needs JDK 17+ (21 works), `ANDROID_HOME` pointing to an SDK with platform 36 and build-tools 36.0.0 (Gradle auto-installs NDK 27.1 once licenses are accepted). The release variant is signed with Expo's default debug keystore, so it is fine for sideloading but not for the Play Store. On the original dev machine (Windows) the SDK lives at `D:\Android\Sdk` and `GRADLE_USER_HOME` at `D:\Android\gradle` because C: is nearly full, and `JAVA_HOME` in the user environment points to a nonexistent path and must be overridden per shell.

## Architecture

### Mobile app (`packages/mobile`)

Expo Router with file-based routes: `app/_layout.tsx` is the root and `app/(tabs)/` holds the two tabs (`index.tsx` = Timeline, `explore.tsx` = Tasks).

**Provider chain in `app/_layout.tsx`:** ErrorBoundary → OneDollarStats (analytics) → SafeArea → QueryClient → `LanguageProvider` → `TasksProvider` → `<Slot />`. The file is marked system-managed: extend it in place, keep the chain intact, and don't remove the analytics provider. Files prefixed `__` (`__analytics.ts`, `__web-safe-area.ts`, `__ErrorBoundary.tsx`) are template-managed; don't edit them.

**All app state is device-local via AsyncStorage; there is no backend call in the product path.**
- Tasks live under key `dayform.tasks.v1`. `lib/tasks-store.ts` is the framework-free store (the tested core); `lib/tasks-context.tsx` is only a thin `useSyncExternalStore` wrapper over it, and `useTasks()` is its public API. Invariant: **a slow, failed or corrupt read must never lead to the stored array being overwritten.** So: writes wait for the initial load, the new list is computed *inside* a single serial queue from the last committed list, and writes are pessimistic (state changes only after `setItem` succeeds; no optimistic update or rollback). A failed read locks writes; if only some records are bad and their copy fails, the store is read-only.
- `lib/task-storage.ts` (`loadTasks`) validates records with a Zod schema, and never writes the main key. Invalid records go to `dayform.tasks.corrupt.<hash>` and unparseable data to `dayform.tasks.backup.<hash>` (content-addressed keys, so repeated launches don't pile up copies). Zod strips unknown fields, so a field added in a newer version is lost if an older build rewrites the data. First launch seeds `seedTasks()` from `lib/planner.ts`.
- `lib/timeline-layout.ts` (`layoutLanes`) assigns side-by-side lanes per cluster of transitively overlapping blocks, using a minimum visual duration matching the 38px minimum block height. The "⚠ Overlap" label is driven by real `overlaps()`, not by lane count.
- `lib/language.tsx` owns the EN/VI switch under `dayform.language.v1`, separate from tasks. It holds the Vietnamese dictionary and exposes `t(text)`. **The English string is the dictionary key**, so a missing translation silently falls back to English; add every new UI string to the `vi` dictionary. User-entered titles/notes and stored category ids must never be translated.
- `lib/planner.ts` has the `Task` model and pure date/time helpers. Dates are local wall-clock `YYYY-MM-DD` strings, times are `HH:mm`, durations are integer minutes, and weeks start Monday. Do not use UTC or `toISOString()` for task dates. `date`/`start` are `null` for backlog tasks. Tasks cannot cross midnight. `overlaps()` drives the conflict warning, which warns but can be overridden on save.
- Timeline spec (06:00–22:00, 64px/hour, side-by-side overlapping blocks, outside-hours list) and the visual tokens are in `design.md`. Colors come from `constants/theme.ts` and `categoryStyle` in `planner.ts`.

`lib/api.ts` and `queries/ping.ts` are an oRPC client to the template's web API. It is typed through `import type { AppRouterClient } from "@template/web"` (a type-only workspace dependency) and reads `expo.extra.apiUrl` from `app.json`, which points at a Runable preview URL. Nothing in the planner depends on it.

`metro.config.js` adds the workspace root to `watchFolders` and `nodeModulesPaths`. Without it, hoisted dependencies don't resolve.

`app.json` carries Runable-specific values (`extra.applicationId`, `apiUrl`, `runableAuthIssuer`, `scheme`) and bundle ids `com.dayform_k7m2.runable` (Android) / `com.dayformk7m2.runable` (iOS). Change them before publishing under another account.

### Web/API template (`packages/web`)

API features are oRPC procedures, one file per feature in `src/api/routes/`, composed into `router` in `src/api/index.ts` and served at `/api/rpc/*` (health at `/api/health`). `src/api/__core/app.ts` is template-managed. `bun run lint` enforces a 500-line cap on each `routes/` file. Drizzle config and scripts (`db:generate|migrate|push`) read the root `.env`.

### Fixed contract with Runable

The root script names (`dev`, `dev:desktop`, `dev:mobile`, `build`, `start`, `stop`, `lint`, `typecheck`, `db:*`) are used by deployment tooling and must keep their names. Ports come from `.runable/ports.json` via `__ports.cjs` and are fixed for the app's lifetime. Don't change them, since each preview URL derives from them. Secrets go in the root `.env`, and browser-exposed values need the `VITE_` prefix.

## Docs

`README.md` (English) and `DOWNLOAD-README-VI.md` (Vietnamese, for the downloadable source ZIP) describe setup. The ZIP is source only, not an APK.
