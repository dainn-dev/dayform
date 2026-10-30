import { describe, expect, test } from "bun:test";
import { DATABASES, applyBackupAttributes, dataExtractionRulesXml, fullBackupContentXml } from "./with-backup-rules";

// The backup rules decide what leaves the phone, so they are pinned by tests.

describe("data extraction rules (Android 12+)", () => {
  const xml = dataExtractionRulesXml();

  test("cloud backup is allowed only on devices that can encrypt it", () => {
    expect(xml).toContain('<cloud-backup disableIfNoEncryptionCapabilities="true">');
  });

  test("only the AsyncStorage database is included, in both cloud backup and device transfer", () => {
    const includes = [...xml.matchAll(/<include domain="([a-z_]+)" path="([^"]+)"/g)].map(match => `${match[1]}:${match[2]}`);
    expect(includes.sort()).toEqual(DATABASES.flatMap(name => [`database:${name}`, `database:${name}`]).sort());
    expect(xml).not.toContain('domain="sharedpref"');
    expect(xml).not.toContain('domain="file"');
    expect(xml).not.toContain('domain="root"');
  });

  test("is well formed", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect((xml.match(/<data-extraction-rules>/g) ?? []).length).toBe(1);
    expect((xml.match(/<\/data-extraction-rules>/g) ?? []).length).toBe(1);
    expect((xml.match(/<\/cloud-backup>/g) ?? []).length).toBe(1);
    expect((xml.match(/<\/device-transfer>/g) ?? []).length).toBe(1);
  });
});

describe("full backup content (Android 6-11)", () => {
  const xml = fullBackupContentXml();

  test("every include requires client-side encryption", () => {
    const includes = xml.match(/<include [^>]*\/>/g) ?? [];
    expect(includes.length).toBe(DATABASES.length);
    for (const include of includes) {
      expect(include).toContain('domain="database"');
      expect(include).toContain('requireFlags="clientSideEncryption"');
    }
  });

  test("includes the same databases as the extraction rules and nothing else", () => {
    for (const name of DATABASES) expect(xml).toContain(`path="${name}"`);
    expect(xml).not.toContain("sharedpref");
    expect(xml).not.toContain('domain="file"');
  });
});

describe("applyBackupAttributes", () => {
  test("points the application element at both rule files", () => {
    const application = applyBackupAttributes({ $: { "android:name": ".MainApplication" } });
    expect(application.$["android:dataExtractionRules"]).toBe("@xml/dayform_data_extraction_rules");
    expect(application.$["android:fullBackupContent"]).toBe("@xml/dayform_backup_rules");
    expect(application.$["android:name"]).toBe(".MainApplication");
  });
});
