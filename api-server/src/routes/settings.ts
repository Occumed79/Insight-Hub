import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const router = Router();

const SETTING_KEYS = ["samApiKey", "defaultKeywords", "defaultDateRange", "organizationName"] as const;

async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(settingsTable);
  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

async function upsertSetting(key: string, value: string) {
  await db
    .insert(settingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
}

function maskKey(key: string | undefined): string | undefined {
  if (!key) return undefined;
  return `${"*".repeat(Math.max(0, key.length - 4))}${key.slice(-4)}`;
}

router.get("/settings", async (req, res) => {
  try {
    const settings = await getAllSettings();

    res.json({
      samApiKeyConfigured: !!settings["samApiKey"],
      samApiKeyMasked: maskKey(settings["samApiKey"]),
      dolApiKeyConfigured: !!settings["dolApiKey"],
      dolApiKeyMasked: maskKey(settings["dolApiKey"]),
      courtListenerTokenConfigured: !!settings["courtListenerToken"],
      courtListenerTokenMasked: maskKey(settings["courtListenerToken"]),
      fecApiKeyConfigured: !!settings["fecApiKey"],
      fecApiKeyMasked: maskKey(settings["fecApiKey"]),
      defaultKeywords: settings["defaultKeywords"] ?? "",
      defaultDateRange: settings["defaultDateRange"] ? parseInt(settings["defaultDateRange"]) : 30,
      organizationName: settings["organizationName"] ?? "",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

router.put("/settings", async (req, res) => {
  try {
    const { samApiKey, dolApiKey, courtListenerToken, fecApiKey, defaultKeywords, defaultDateRange, organizationName } = req.body as {
      samApiKey?: string;
      dolApiKey?: string;
      courtListenerToken?: string;
      fecApiKey?: string;
      defaultKeywords?: string;
      defaultDateRange?: number;
      organizationName?: string;
    };

    if (samApiKey !== undefined && samApiKey.trim() !== "") {
      await upsertSetting("samApiKey", samApiKey.trim());
    }
    if (dolApiKey !== undefined && dolApiKey.trim() !== "") {
      await upsertSetting("dolApiKey", dolApiKey.trim());
    }
    if (courtListenerToken !== undefined && courtListenerToken.trim() !== "") {
      await upsertSetting("courtListenerToken", courtListenerToken.trim());
    }
    if (fecApiKey !== undefined && fecApiKey.trim() !== "") {
      await upsertSetting("fecApiKey", fecApiKey.trim());
    }
    if (defaultKeywords !== undefined) {
      await upsertSetting("defaultKeywords", defaultKeywords);
    }
    if (defaultDateRange !== undefined) {
      await upsertSetting("defaultDateRange", String(defaultDateRange));
    }
    if (organizationName !== undefined) {
      await upsertSetting("organizationName", organizationName);
    }

    const settings = await getAllSettings();

    res.json({
      samApiKeyConfigured: !!settings["samApiKey"],
      samApiKeyMasked: maskKey(settings["samApiKey"]),
      dolApiKeyConfigured: !!settings["dolApiKey"],
      dolApiKeyMasked: maskKey(settings["dolApiKey"]),
      courtListenerTokenConfigured: !!settings["courtListenerToken"],
      courtListenerTokenMasked: maskKey(settings["courtListenerToken"]),
      fecApiKeyConfigured: !!settings["fecApiKey"],
      fecApiKeyMasked: maskKey(settings["fecApiKey"]),
      defaultKeywords: settings["defaultKeywords"] ?? "",
      defaultDateRange: settings["defaultDateRange"] ? parseInt(settings["defaultDateRange"]) : 30,
      organizationName: settings["organizationName"] ?? "",
    });
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;
