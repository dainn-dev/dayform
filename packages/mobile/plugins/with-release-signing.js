// Expo config plugin: sign the Android RELEASE build with a private keystore taken from the environment.
//
// The generated android/app/build.gradle signs release builds with the public template debug key.
// This plugin adds a `release` signing config that reads
//   DAYFORM_KEYSTORE_PATH, DAYFORM_KEYSTORE_PASSWORD, DAYFORM_KEY_ALIAS, DAYFORM_KEY_PASSWORD
// and uses it for the release build type. Without DAYFORM_KEYSTORE_PATH it falls back to the debug key
// (local development builds), unless DAYFORM_REQUIRE_RELEASE_SIGNING is set (CI), in which case the
// build fails instead of silently producing a debug-signed release.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "DAYFORM_KEYSTORE_PATH";

const RELEASE_SIGNING_CONFIG = `
        release {
            def keystorePath = System.getenv("DAYFORM_KEYSTORE_PATH")
            if (keystorePath) {
                storeFile file(keystorePath)
                storePassword System.getenv("DAYFORM_KEYSTORE_PASSWORD")
                keyAlias System.getenv("DAYFORM_KEY_ALIAS")
                keyPassword System.getenv("DAYFORM_KEY_PASSWORD")
            }
        }`;

const RELEASE_BUILD_TYPE_SIGNING = `if (System.getenv("DAYFORM_KEYSTORE_PATH")) {
                signingConfig signingConfigs.release
            } else if (System.getenv("DAYFORM_REQUIRE_RELEASE_SIGNING")) {
                throw new GradleException("DAYFORM_REQUIRE_RELEASE_SIGNING is set but DAYFORM_KEYSTORE_PATH is not")
            } else {
                signingConfig signingConfigs.debug
            }`;

// The debug config block of the generated file, and the release build type's signing line that follows
// the template's "In production, you need to generate your own keystore" comment.
const DEBUG_CONFIG = /(signingConfigs\s*\{\s*debug\s*\{[^}]*\})/;
const RELEASE_SIGNING_LINE = /(\/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.\s*)signingConfig signingConfigs\.debug/;

/** Pure text transform (exported for testing). Throws when the template changed and nothing can be patched. */
function applyReleaseSigning(contents) {
  if (contents.includes(MARKER)) return contents;
  if (!DEBUG_CONFIG.test(contents) || !RELEASE_SIGNING_LINE.test(contents)) {
    throw new Error("with-release-signing: could not find the signing blocks in android/app/build.gradle; the Expo template changed.");
  }
  return contents
    .replace(DEBUG_CONFIG, `$1${RELEASE_SIGNING_CONFIG}`)
    .replace(RELEASE_SIGNING_LINE, `$1${RELEASE_BUILD_TYPE_SIGNING}`);
}

const withReleaseSigning = config =>
  withAppBuildGradle(config, modConfig => {
    modConfig.modResults.contents = applyReleaseSigning(modConfig.modResults.contents);
    return modConfig;
  });

module.exports = withReleaseSigning;
module.exports.applyReleaseSigning = applyReleaseSigning;
