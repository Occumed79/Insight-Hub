import { Router } from "express";
import { rfpDb as db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { providerRegistry } from "../lib/providers";
import {
  PROVIDER_DEFINITIONS,
  RFP_INGESTION_PROVIDER_NAMES,
  type RfpProviderName,
} from "../lib/config/providerConfig";

const router = Router();

const INTERNAL_PUBLIC_PORTAL_ADAPTERS = new Set<RfpProviderName>(["texasEsbd", "nyScr"]);
const PROVIDER_NAMES = (Object.keys(PROVIDER_DEFINITIONS) as RfpProviderName[]).filter(
  (name) => !INTERNAL_PUBLIC_PORTAL_ADAPTERS.has(name),
);
const RFP_INGESTION_PROVIDER_SET = new Set<string>(RFP_INGESTION_PROVIDER_NAMES);

function ingestionMode(name: RfpProviderName) {
  if (name === "bidnet") return "stub" as const;
  if (name === "publicPortalProviders") return "hybrid" as const;
  if (PROVIDER_DEFINITIONS[name].useCase === "web_discovery") return "discovery" as const;
  return "direct" as const;
}

/**
 * GET /api/providers
 * Returns status of all configured RFP/opportunity providers.
 *
 * USAspending and Federal Register are intentionally excluded here because they
 * feed Federal Agencies intelligence windows instead of the RFP provider list.
 */
router.get("/providers", async (req, res) => {
  try {
    const statuses = await Promise.all(
      PROVIDER_NAMES.map(async (name) => {
        const provider = providerRegistry[name];
        const def = PROVIDER_DEFINITIONS[name];
        try {
          const status = await provider.getStatus();
          return {
            name,
            displayName: def.displayName,
            description: def.description,
            category: def.category,
            useCase: def.useCase,
            ingestionEligible: RFP_INGESTION_PROVIDER_SET.has(name),
            ingestionMode: ingestionMode(name),
            capabilities: def.capabilities,
            docsUrl: def.docsUrl,
            signupUrl: def.signupUrl,
            notes: def.notes,
            requiredFields: def.requiredFields.map((f) => ({
              key: f.key,
              label: f.label,
              type: f.type,
              placeholder: f.placeholder,
              description: f.description,
              dbKey: f.dbKey,
            })),
            optionalFields: def.optionalFields.map((f) => ({
              key: f.key,
              label: f.label,
              type: f.type,
              placeholder: f.placeholder,
              description: f.description,
              dbKey: f.dbKey,
            })),
            status: {
              configured: status.configured,
              healthy: status.healthy,
              errorMessage: status.errorMessage,
              recordCount: status.recordCount,
              lastAttempt: status.lastAttempt,
              lastSuccess: status.lastSuccess,
            },
          };
        } catch (err: any) {
          return {
            name,
            displayName: def.displayName,
            description: def.description,
            category: def.category,
            useCase: def.useCase,
            ingestionEligible: RFP_INGESTION_PROVIDER_SET.has(name),
            ingestionMode: ingestionMode(name),
            capabilities: def.capabilities,
            docsUrl: def.docsUrl,
            signupUrl: def.signupUrl,
            notes: def.notes,
            requiredFields: def.requiredFields.map((f) => ({ key: f.key, label: f.label, type: f.type, placeholder: f.placeholder, description: f.description, dbKey: f.dbKey })),
            optionalFields: def.optionalFields.map((f) => ({ key: f.key, label: f.label, type: f.type, placeholder: f.placeholder, description: f.description, dbKey: f.dbKey })),
            status: {
              configured: false,
              healthy: false,
              errorMessage: err.message,
            },
          };
        }
      })
    );
    return res.json({ providers: statuses });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to get provider statuses" });
  }
});

/**
 * PUT /api/providers/:name
 * Save or remove credentials for a specific provider.
 *
 * Field handling rules:
 *   - A field key that is absent from the body → current stored value is PRESERVED.
 *   - A field key present with a non-empty string value → stored/updated.
 *   - A field key present with an empty string OR explicitly listed in the
 *     top-level `remove` array → the stored database value is DELETED (cleared).
 *
 * The `remove` array is the unambiguous removal path:
 *   { "remove": ["bidnetApiKey", "bidnetBaseUrl"] }
 * An empty string value is also treated as an explicit clear to match form behaviour.
 *
 * Environment-variable credentials are never touched — only DB overrides are removed.
 */
router.put("/providers/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const providerName = name as RfpProviderName;
    const def = PROVIDER_DEFINITIONS[providerName];
    if (!def) {
      return res.status(404).json({ error: `Unknown RFP provider: ${name}` });
    }

    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const body = req.body as Record<string, unknown>;

    // Build the explicit removal set from the optional `remove` array.
    const explicitRemove = new Set<string>(
      Array.isArray(body.remove)
        ? (body.remove as unknown[]).filter((v): v is string => typeof v === "string")
        : [],
    );

    const allFields = [...def.requiredFields, ...def.optionalFields];
    const removedKeys: string[] = [];
    const savedKeys: string[] = [];

    for (const field of allFields) {
      const shouldRemove =
        explicitRemove.has(field.dbKey) ||
        (field.dbKey in body && (body[field.dbKey] === null || body[field.dbKey] === ""));

      if (shouldRemove) {
        // Delete the stored DB override. Env-variable credentials are unaffected.
        await db.delete(settingsTable).where(eq(settingsTable.key, field.dbKey));
        removedKeys.push(field.dbKey);
        continue;
      }

      // Field absent from body → preserve current value (no-op).
      if (!(field.dbKey in body) || body[field.dbKey] === undefined) {
        continue;
      }

      const rawValue = body[field.dbKey];
      if (typeof rawValue === "object" && rawValue !== null) {
        return res.status(400).json({ error: `Invalid value for ${field.dbKey}` });
      }

      const normalized = String(rawValue).trim();
      if (normalized !== "") {
        await db
          .insert(settingsTable)
          .values({ key: field.dbKey, value: normalized })
          .onConflictDoUpdate({ target: settingsTable.key, set: { value: normalized } });
        savedKeys.push(field.dbKey);
      }
    }

    // Return updated status — wrap in try/catch so a failing status check
    // doesn't prevent the save/remove from being reported successfully.
    const provider = providerRegistry[providerName];
    let status: Awaited<ReturnType<typeof provider.getStatus>>;
    try {
      status = await provider.getStatus();
    } catch {
      status = { name: providerName, configured: false, healthy: false, errorMessage: "Status check unavailable" };
    }
    return res.json({
      name,
      status,
      ...(removedKeys.length > 0 && {
        removed: removedKeys,
        removedNote: "The stored database override was removed for the listed keys. Any matching Render environment variable is unaffected and will continue to be used.",
      }),
      ...(savedKeys.length > 0 && { saved: savedKeys }),
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to save provider credentials" });
  }
});

/**
 * DELETE /api/providers/:name/credential/:dbKey
 * Explicitly remove a single stored database credential override.
 * The corresponding environment variable (if any) is unaffected.
 */
router.delete("/providers/:name/credential/:dbKey", async (req, res) => {
  try {
    const { name, dbKey } = req.params;
    const providerName = name as RfpProviderName;
    const def = PROVIDER_DEFINITIONS[providerName];
    if (!def) {
      return res.status(404).json({ error: `Unknown RFP provider: ${name}` });
    }

    const allFields = [...def.requiredFields, ...def.optionalFields];
    const fieldDef = allFields.find((f) => f.dbKey === dbKey);
    if (!fieldDef) {
      return res.status(404).json({ error: `Unknown credential field: ${dbKey}` });
    }

    await db.delete(settingsTable).where(eq(settingsTable.key, dbKey));

    return res.json({
      name,
      dbKey,
      removed: true,
      note: "The stored database override was removed. Any matching Render environment variable is unaffected and will continue to be used.",
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to remove credential" });
  }
});

export default router;
