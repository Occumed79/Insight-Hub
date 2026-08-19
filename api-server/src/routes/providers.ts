import { Router } from "express";
import { rfpDb as db } from "@workspace/db";
import { settingsTable } from "@workspace/db/schema";
import { opportunityIngestionRunsTable } from "@workspace/db/schema/rfp";
import { desc, eq, inArray } from "drizzle-orm";
import { providerRegistry } from "../lib/providers";
import {
  PROVIDER_DEFINITIONS,
  RFP_INGESTION_PROVIDER_NAMES,
  type RfpProviderName,
} from "../lib/config/providerConfig";
import { sourceDefinition } from "../lib/sourceArchitecture";
import { jinaProvider } from "../lib/providers/jina";
import { keenableProvider } from "../lib/providers/keenable";
import { microlinkProvider } from "../lib/providers/microlink";
import {
  credentialPoolTelemetry,
  type CredentialPoolSnapshot,
} from "../lib/providers/freeTierCredentialPool";
import { providerBudgetSnapshot } from "../lib/providerBudget";
import { DISCOVERY_QUOTA_POLICIES } from "../lib/discoveryQuotaPolicy";
import { ingestionRunTelemetrySnapshot } from "../lib/ingestion/ingestionRuntimeTelemetry";

const router = Router();

const INTERNAL_PUBLIC_PORTAL_ADAPTERS = new Set<RfpProviderName>([
  "texasEsbd",
  "nyScr",
]);
const RFP_INGESTION_PROVIDER_SET = new Set<string>(
  RFP_INGESTION_PROVIDER_NAMES,
);

function isRetiredProvider(name: RfpProviderName): boolean {
  const source = sourceDefinition(name);
  return Boolean(source && (!source.active || source.role === "legacy_disabled"));
}

const PROVIDER_NAMES = (
  Object.keys(PROVIDER_DEFINITIONS) as RfpProviderName[]
).filter(
  (name) =>
    !INTERNAL_PUBLIC_PORTAL_ADAPTERS.has(name) && !isRetiredProvider(name),
);

function ingestionMode(name: string) {
  const source = sourceDefinition(name);
  if (source?.role === "direct_source") return "direct" as const;
  if (source?.role === "browser_discovery") return "discovery" as const;
  if (source?.role === "enrichment") return "enrichment" as const;
  if (source?.role === "ai_judge") return "judge" as const;
  if (source?.role === "retrieval") return "retrieval" as const;
  if (source?.role === "intelligence") return "intelligence" as const;
  return "support" as const;
}

async function currentTelemetryRunId(explicit?: unknown): Promise<string | null> {
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  try {
    const [row] = await db
      .select({ id: opportunityIngestionRunsTable.id })
      .from(opportunityIngestionRunsTable)
      .where(
        inArray(opportunityIngestionRunsTable.status, ["queued", "running"]),
      )
      .orderBy(desc(opportunityIngestionRunsTable.createdAt))
      .limit(1);
    return row?.id ?? null;
  } catch {
    return null;
  }
}

router.get("/providers", async (req, res) => {
  try {
    const providers = await Promise.all(
      PROVIDER_NAMES.map(async (name) => {
        const provider = providerRegistry[name];
        const def = PROVIDER_DEFINITIONS[name];
        const source = sourceDefinition(name);
        try {
          const status = await provider.getStatus();
          return {
            name,
            displayName: def.displayName,
            description: def.description,
            category: def.category,
            useCase: def.useCase,
            sourceRole: source?.role ?? null,
            ingestionEligible: RFP_INGESTION_PROVIDER_SET.has(name),
            ingestionMode: ingestionMode(name),
            capabilities: def.capabilities,
            docsUrl: def.docsUrl,
            signupUrl: def.signupUrl,
            notes: def.notes,
            requiredFields: def.requiredFields.map((field) => ({
              key: field.key,
              label: field.label,
              type: field.type,
              placeholder: field.placeholder,
              description: field.description,
              dbKey: field.dbKey,
            })),
            optionalFields: def.optionalFields.map((field) => ({
              key: field.key,
              label: field.label,
              type: field.type,
              placeholder: field.placeholder,
              description: field.description,
              dbKey: field.dbKey,
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
        } catch (error: any) {
          return {
            name,
            displayName: def.displayName,
            description: def.description,
            category: def.category,
            useCase: def.useCase,
            sourceRole: source?.role ?? null,
            ingestionEligible: RFP_INGESTION_PROVIDER_SET.has(name),
            ingestionMode: ingestionMode(name),
            capabilities: def.capabilities,
            docsUrl: def.docsUrl,
            signupUrl: def.signupUrl,
            notes: def.notes,
            requiredFields: def.requiredFields.map((field) => ({
              key: field.key,
              label: field.label,
              type: field.type,
              placeholder: field.placeholder,
              description: field.description,
              dbKey: field.dbKey,
            })),
            optionalFields: def.optionalFields.map((field) => ({
              key: field.key,
              label: field.label,
              type: field.type,
              placeholder: field.placeholder,
              description: field.description,
              dbKey: field.dbKey,
            })),
            status: {
              configured: false,
              healthy: false,
              errorMessage: error.message,
            },
          };
        }
      }),
    );

    return res.json({ providers });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to get provider statuses" });
  }
});

/**
 * Safe operational telemetry for Fetch Intelligence. Never returns credential
 * values. Account telemetry exposes slot names, per-slot outcomes, vendor quota
 * headers when available, and cooldown/reset timestamps.
 */
router.get("/providers/telemetry", async (req, res) => {
  try {
    await Promise.all([
      import("../lib/providers/gemini"),
      import("../lib/providers/groq"),
      import("../lib/providers/openrouter"),
      import("../lib/providers/cohere"),
      import("../lib/providers/exa"),
      import("../lib/providers/you"),
      import("../lib/providers/firecrawl"),
      import("../lib/providers/browserbase"),
    ]);

    const budgetNames = [
      "samGov",
      "tango",
      "you",
      "browserbase",
      "keenable",
      "parallel",
      "exa",
      "firecrawl",
      "langsearch",
      "langsearch:primary",
      "langsearch:secondary",
      "langsearch:tertiary",
      "langsearch:quaternary",
      "linkup",
      "socrata",
      "websearch",
      "microlink",
    ];
    const [
      credentialPools,
      budgets,
      jinaMode,
      keenableMode,
      microlinkMode,
      runId,
    ] = await Promise.all([
      credentialPoolTelemetry(),
      providerBudgetSnapshot(budgetNames),
      jinaProvider.usageMode(),
      keenableProvider.usageMode(),
      microlinkProvider.usageMode(),
      currentTelemetryRunId(req.query.runId),
    ]);

    const poolsById = Object.fromEntries(
      credentialPools.map((pool: CredentialPoolSnapshot) => [pool.id, pool]),
    );

    return res.json({
      generatedAt: new Date().toISOString(),
      quotaPolicies: DISCOVERY_QUOTA_POLICIES,
      credentialPools: poolsById,
      budgets,
      utilityModes: {
        jina: jinaMode,
        keenable: keenableMode,
        microlink: microlinkMode,
      },
      run: runId ? ingestionRunTelemetrySnapshot(runId) : null,
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to get provider telemetry" });
  }
});

router.put("/providers/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const providerName = name as RfpProviderName;
    const def = PROVIDER_DEFINITIONS[providerName];
    if (!def) {
      return res.status(404).json({ error: `Unknown RFP provider: ${name}` });
    }
    if (isRetiredProvider(providerName)) {
      return res.status(410).json({
        error: `${def.displayName} is retired and cannot accept new runtime configuration.`,
      });
    }
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body)) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const body = req.body as Record<string, unknown>;
    const explicitRemove = new Set<string>(
      Array.isArray(body.remove)
        ? (body.remove as unknown[]).filter(
            (value): value is string => typeof value === "string",
          )
        : [],
    );
    const allFields = [...def.requiredFields, ...def.optionalFields];
    const removedKeys: string[] = [];
    const savedKeys: string[] = [];

    for (const field of allFields) {
      const shouldRemove =
        explicitRemove.has(field.dbKey) ||
        (field.dbKey in body &&
          (body[field.dbKey] === null || body[field.dbKey] === ""));
      if (shouldRemove) {
        await db.delete(settingsTable).where(eq(settingsTable.key, field.dbKey));
        removedKeys.push(field.dbKey);
        continue;
      }
      if (!(field.dbKey in body) || body[field.dbKey] === undefined) continue;
      const rawValue = body[field.dbKey];
      if (typeof rawValue === "object" && rawValue !== null) {
        return res.status(400).json({ error: `Invalid value for ${field.dbKey}` });
      }
      const normalized = String(rawValue).trim();
      if (normalized !== "") {
        await db
          .insert(settingsTable)
          .values({ key: field.dbKey, value: normalized })
          .onConflictDoUpdate({
            target: settingsTable.key,
            set: { value: normalized },
          });
        savedKeys.push(field.dbKey);
      }
    }

    const provider = providerRegistry[providerName];
    let status: Awaited<ReturnType<typeof provider.getStatus>>;
    try {
      status = await provider.getStatus();
    } catch {
      status = {
        name: providerName,
        configured: false,
        healthy: false,
        errorMessage: "Status check unavailable",
      };
    }
    return res.json({
      name,
      status,
      ...(removedKeys.length > 0 && {
        removed: removedKeys,
        removedNote:
          "The stored database override was removed for the listed keys. Any matching environment variable is unaffected and will continue to be used.",
      }),
      ...(savedKeys.length > 0 && { saved: savedKeys }),
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to save provider credentials" });
  }
});

router.delete("/providers/:name/credential/:dbKey", async (req, res) => {
  try {
    const { name, dbKey } = req.params;
    const providerName = name as RfpProviderName;
    const def = PROVIDER_DEFINITIONS[providerName];
    if (!def) {
      return res.status(404).json({ error: `Unknown RFP provider: ${name}` });
    }
    const allFields = [...def.requiredFields, ...def.optionalFields];
    const fieldDef = allFields.find((field) => field.dbKey === dbKey);
    if (!fieldDef) {
      return res.status(404).json({ error: `Unknown credential field: ${dbKey}` });
    }
    await db.delete(settingsTable).where(eq(settingsTable.key, dbKey));
    return res.json({
      name,
      dbKey,
      removed: true,
      note:
        "The stored database override was removed. Any matching environment variable is unaffected and will continue to be used.",
    });
  } catch (error) {
    req.log.error(error);
    return res.status(500).json({ error: "Failed to remove credential" });
  }
});

export default router;
