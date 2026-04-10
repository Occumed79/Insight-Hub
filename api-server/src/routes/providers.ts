import { Router } from "express";
import { db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { providerRegistry } from "../lib/providers";
import { PROVIDER_DEFINITIONS, ProviderName } from "../lib/config/providerConfig";

const router = Router();

const PROVIDER_NAMES = Object.keys(PROVIDER_DEFINITIONS) as ProviderName[];

/**
 * GET /api/providers
 * Returns status of all configured providers.
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
 * Save credentials for a specific provider.
 * Body is a key-value map of dbKey -> value.
 */
router.put("/providers/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const def = PROVIDER_DEFINITIONS[name as ProviderName];
    if (!def) {
      return res.status(404).json({ error: `Unknown provider: ${name}` });
    }

    const body = req.body as Record<string, string>;
    const allFields = [...def.requiredFields, ...def.optionalFields];

    for (const field of allFields) {
      const value = body[field.dbKey];
      if (value !== undefined && value.trim() !== "") {
        await db
          .insert(settingsTable)
          .values({ key: field.dbKey, value: value.trim() })
          .onConflictDoUpdate({ target: settingsTable.key, set: { value: value.trim() } });
      }
    }

    // Return updated status — wrap in try/catch so a failing status check
    // doesn't prevent the credential from being saved successfully.
    const provider = providerRegistry[name as ProviderName];
    let status: Awaited<ReturnType<typeof provider.getStatus>>;
    try {
      status = await provider.getStatus();
    } catch {
      status = { name: name as ProviderName, configured: true, healthy: false, errorMessage: "Status check unavailable" };
    }
    return res.json({ name, status });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to save provider credentials" });
  }
});

export default router;
