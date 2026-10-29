# Dayform

A local-first Expo weekly planner. The mobile app lives in `packages/mobile`; the other managed template packages remain in place but are not used for task storage.

Use the **EN / VI** switch at the top of Timeline or Tasks to change the interface language. The preference persists on this device under `dayform.language.v1`, separately from tasks. Vietnamese uses 24-hour time and localized dates/durations. Task titles and notes are never translated or modified. Dictionaries and formatting live in `packages/mobile/lib/language.tsx`.

## Run and verify

```bash
bun install
bun run dev:mobile     # Expo preview on the fixed mobile port in __ports.cjs
bun run typecheck
bun run lint
bun run build
```

Use Expo Go for device development or the Runable mobile preview for the web-rendered view. No account or API keys are required. Tasks are saved to device-local AsyncStorage; clearing app/browser data removes them. The first launch includes editable sample tasks. Week navigation starts Monday; task dates/times are local wall-clock values. Conflicts warn but can be saved explicitly. Tasks cannot cross midnight.

The mobile project targets **Expo SDK 57**. Android devices need Expo Go for SDK 57 from [expo.dev/go](https://expo.dev/go). Physical iPhones cannot use the App Store Expo Go for SDK 57; use a development build or Expo Go distributed through TestFlight (`eas go`, with Apple Developer Program membership). The web-rendered Runable preview remains available without Expo Go.

## Managed template notes

Runable copies this Bun and Turborepo project into each new sandbox.

The root package commands are the external contract:

- `bun run dev` starts the web app.
- `bun run dev:desktop` and `bun run dev:mobile` start platform clients.
- `bun run build` builds every package.
- `bun run start` starts or restarts the production server.
- `bun run stop` stops the production server.
- `bun run lint` and `bun run typecheck` validate the project.
- The `db:generate`, `db:migrate`, and `db:push` commands manage the database.

Deployment tools depend on these command names. Their implementations may change, but the names must remain stable.

The web package owns the API, database, and shared web interface. The mobile package is an Expo client. The desktop package is an Electron shell around the web app. Services use the fixed ports defined in `__ports.cjs`, and the web health endpoint is `/api/health`.

Secrets belong in the root `.env` file. Browser values must use the `VITE_` prefix. Commands prefixed with `internal:` are for template maintenance.
