import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { resolveCredential } from "../lib/config/providerConfig";

const router = Router();

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

async function removeSetting(key: string) {
  await db.delete(settingsTable).where(eq(settingsTable.key, key));
}

/**
 * Mask a secret for safe display in API responses.
 * Returns undefined when the value is absent so the field can be omitted.
 * Never returns the raw secret value.
 */
function maskSecret(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

/**
 * Build the settings response object.
 *
 * Credential configured/masked fields reflect the effective resolved value
 * (env-first, then DB fallback) so the UI accurately shows whether a key
 * is active regardless of which source supplied it.
 * The raw value is never included.
 */
async function buildSettingsResponse() {
  const settings = await getAllSettings();

  // Resolve effective configured state using env-first precedence.
  // We check both env and DB without exposing either value.
  const [samResolved, dolResolved, clResolved, fecResolved] = await Promise.all([
    resolveCredential("samApiKey", "SAM_GOV_API_KEY"),
    resolveCredential("dolApiKey", "DOL_API_KEY"),
    resolveCredential("courtListenerToken", "COURT_LISTENER_TOKEN"),
    resolveCredential("fecApiKey", "FEC_API_KEY"),
  ]);

  return {
    // Configured = true when ANY source (env OR db) has a non-empty value.
    samApiKeyConfigured: !!samResolved,
    // Masked = DB-stored override only (env vars are never masked/shown).
    samApiKeyMasked: maskSecret(settings["samApiKey"]),
    dolApiKeyConfigured: !!dolResolved,
    dolApiKeyMasked: maskSecret(settings["dolApiKey"]),
    courtListenerTokenConfigured: !!clResolved,
    courtListenerTokenMasked: maskSecret(settings["courtListenerToken"]),
    fecApiKeyConfigured: !!fecResolved,
    fecApiKeyMasked: maskSecret(settings["fecApiKey"]),
    defaultKeywords: settings["defaultKeywords"] ?? "",
    defaultDateRange: settings["defaultDateRange"] ? parseInt(settings["defaultDateRange"]) : 30,
    organizationName: settings["organizationName"] ?? "",
  };
}

router.get("/settings", async (req, res) => {
  try {
    res.json(await buildSettingsResponse());
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

/**
 * PUT /api/settings
 *
 * Save or clear application-level settings.
 *
 * Secret field handling:
 *   - Field absent from body → current value preserved.
 *   - Field present with a non-empty string → DB override stored/updated.
 *   - Field present with an empty string → DB override removed (cleared).
 *     The corresponding environment variable is NOT affected.
 *
 * Non-secret fields (defaultKeywords, defaultDateRange, organizationName):
 *   - Field absent → preserved.
 *   - Field present → stored as-is (empty string allowed).
 */
router.put("/settings", async (req, res) => {
  try {
    const body = req.body as {
      samApiKey?: string;
      dolApiKey?: string;
      courtListenerToken?: string;
      fecApiKey?: string;
      defaultKeywords?: string;
      defaultDateRange?: number;
      organizationName?: string;
    };

    const secretFields: Array<{ bodyKey: keyof typeof body; dbKey: string }> = [
      { bodyKey: "samApiKey", dbKey: "samApiKey" },
      { bodyKey: "dolApiKey", dbKey: "dolApiKey" },
      { bodyKey: "courtListenerToken", dbKey: "courtListenerToken" },
      { bodyKey: "fecApiKey", dbKey: "fecApiKey" },
    ];

    for (const { bodyKey, dbKey } of secretFields) {
      const value = body[bodyKey];
      if (value === undefined) continue; // absent → preserve
      if (typeof value === "string" && value.trim() !== "") {
        await upsertSetting(dbKey, value.trim()); // non-empty → store
      } else if (value === "" || (typeof value === "string" && value.trim() === "")) {
        await removeSetting(dbKey); // empty → clear DB override
      }
    }

    if (body.defaultKeywords !== undefined) {
      await upsertSetting("defaultKeywords", body.defaultKeywords);
    }
    if (body.defaultDateRange !== undefined) {
      await upsertSetting("defaultDateRange", String(body.defaultDateRange));
    }
    if (body.organizationName !== undefined) {
      await upsertSetting("organizationName", body.organizationName);
    }

    res.json(await buildSettingsResponse());
  } catch (err) {
    req.log.error(err);
    res.status(500).json({ error: "Failed to save settings" });
  }
});

export default router;
