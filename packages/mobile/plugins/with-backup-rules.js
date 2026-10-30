// Expo config plugin: let Android's Auto Backup keep an ENCRYPTED copy of the app's data in the user's own Google account.
//
// All of Dayform's data lives in AsyncStorage, which on Android is ONE SQLite database (RKStorage; "AsyncStorage" in the
// newer storage). Backup rules work on files and databases, not on single keys, so this plugin includes exactly that
// database and nothing else: no expo-updates bundle cache, no shared preferences, no caches or exported files.
//
// Encryption is required, not optional:
//   * Android 12+ (`dataExtractionRules`): `disableIfNoEncryptionCapabilities="true"` makes cloud backup happen only on
//     devices that can encrypt it end to end with the user's screen lock;
//   * Android 9-11 (`fullBackupContent`): `requireFlags="clientSideEncryption"` on the include does the same;
//   * older Android: no encrypted backup exists, so nothing is backed up.
// Device-to-device transfer (setting up a new phone from an old one) carries the same database.
//
// Restore happens when the app is installed on a device that has a backup; the app then starts from that data.
const fs = require("fs");
const path = require("path");
const { withAndroidManifest, withDangerousMod } = require("expo/config-plugins");

/** AsyncStorage's database file names (2.x uses RKStorage; the next storage uses AsyncStorage). A missing one is ignored. */
const DATABASES = ["RKStorage", "AsyncStorage"];
const EXTRACTION_RULES = "dayform_data_extraction_rules";
const BACKUP_RULES = "dayform_backup_rules";

const includes = (indent, extra = "") => DATABASES.map(name => `${indent}<include domain="database" path="${name}"${extra} />`).join("\n");

/** Android 12+ rules (`android:dataExtractionRules`). */
function dataExtractionRulesXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
    <cloud-backup disableIfNoEncryptionCapabilities="true">
${includes("        ")}
    </cloud-backup>
    <device-transfer>
${includes("        ")}
    </device-transfer>
</data-extraction-rules>
`;
}

/** Android 6-11 rules (`android:fullBackupContent`). */
function fullBackupContentXml() {
  return `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
${includes("    ", ' requireFlags="clientSideEncryption"')}
</full-backup-content>
`;
}

/** Points the <application> element at the two rule files (exported for testing). */
function applyBackupAttributes(application) {
  application.$["android:dataExtractionRules"] = `@xml/${EXTRACTION_RULES}`;
  application.$["android:fullBackupContent"] = `@xml/${BACKUP_RULES}`;
  return application;
}

const withBackupRules = config => {
  config = withAndroidManifest(config, modConfig => {
    const [application] = modConfig.modResults.manifest.application;
    applyBackupAttributes(application);
    return modConfig;
  });
  return withDangerousMod(config, ["android", async modConfig => {
    const dir = path.join(modConfig.modRequest.platformProjectRoot, "app", "src", "main", "res", "xml");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${EXTRACTION_RULES}.xml`), dataExtractionRulesXml());
    fs.writeFileSync(path.join(dir, `${BACKUP_RULES}.xml`), fullBackupContentXml());
    return modConfig;
  }]);
};

module.exports = withBackupRules;
module.exports.dataExtractionRulesXml = dataExtractionRulesXml;
module.exports.fullBackupContentXml = fullBackupContentXml;
module.exports.applyBackupAttributes = applyBackupAttributes;
module.exports.DATABASES = DATABASES;
