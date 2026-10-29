# Releasing Dayform

Releases are signed APKs published as **GitHub Releases** of this repo. The app's update check
(`lib/update-check.ts`) reads the latest non-prerelease and shows a popup when its version is newer.

## Every release

1. Bump `expo.version` (patch) and `expo.android.versionCode` (+1) in `packages/mobile/app.json`.
2. Commit and push to `main`. The **CI** workflow runs the tests and both typechecks.
3. Tag and push: `git tag v<version> && git push origin v<version>` (the tag must be exactly `v` + `expo.version`).
4. The **Release** workflow tests, builds on Linux, signs with the private key, verifies the signature and
   version, and creates the release with `dayform-<version>.apk` and `dayform-<version>.apk.sha256`.

Without GitHub Actions: `bash scripts/release-local.sh` does the same from this machine (asks before publishing).

## JavaScript-only changes: over-the-air update (no new APK)

A change that only touches JavaScript, assets or strings can reach installed phones without a new APK:

1. Commit and push to `main` (CI must be green). Do **not** change `expo.version`: updates only reach the APK with
   the same version (`runtimeVersion` policy `appVersion`).
2. GitHub → Actions → **OTA update** → Run workflow. It tests, builds a signed static site and deploys it to Cloudflare
   Pages (`dayform-updates.pages.dev`), then checks the live manifest headers.
3. Phones download it in the background (at most every 12 h, or Settings → Updates → Check for updates) and use it the
   **next time the app is opened**.

Anything native needs the normal APK release above: Kotlin, permissions, icons, `app.json`, a new native library,
an Expo SDK upgrade. The site serves one runtime version at a time (the newest published), so after a new APK
release publish an OTA once for that version if you want it to receive updates. Keep data changes backward
compatible: an older bundle rewrites storage and drops fields it does not know.

Secrets: `DAYFORM_OTA_PRIVATE_KEY` (the update signing key, separate from the APK key), `CLOUDFLARE_API_TOKEN`
(Pages: Edit only), `CLOUDFLARE_ACCOUNT_ID`. The certificate `packages/mobile/ota/certs/certificate.pem` is public and
embedded in every APK; the private key lives in `~/.dayform-signing/ota/` and must be backed up like the APK key.
Rotating the OTA key needs a new APK (new certificate) and a new `expo.version`.

## Signing key (read this)

* Releases are signed with a **private** key. Android only installs an update over an installed app when the
  signature matches, so **losing the key means every installed copy has to be uninstalled (its data is lost) to move
  to a new key.** Back up `~/.dayform-signing/` somewhere safe and private (password manager, encrypted drive).
* The key lives **outside the repo** and must never be committed (`*.jks`, `*.keystore`, `signing-info*` are ignored).
* CI reads it from repository secrets: `DAYFORM_KEYSTORE_BASE64`, `DAYFORM_KEYSTORE_PASSWORD`,
  `DAYFORM_KEY_ALIAS`, `DAYFORM_KEY_PASSWORD`. Optional repository variable `DAYFORM_CERT_SHA256`
  (lower-case hex, no colons) makes CI refuse an APK signed by any other key.
* `packages/mobile/plugins/with-release-signing.js` wires the key into the generated Gradle project. Without the
  environment variables a local build falls back to the public debug key; with `DAYFORM_REQUIRE_RELEASE_SIGNING=1`
  (CI and `release-local.sh`) it fails instead.

## Notes

* Release notes (commit subjects since the previous tag, plus the SHA-256) are also what the update popup shows.
* Only `arm64-v8a` is built by default (`DAYFORM_ABIS`). Add `armeabi-v7a` / `x86_64` for older phones or emulators.
* The repo is public: anyone can download the APK. The update checks send no task data (the APK check reveals the
  device IP to GitHub; the content check sends the platform, runtime version and an expo-updates device id to the
  update server) and both are switched off by one switch in Settings → Updates.
