import { Router } from "express";
import { eq } from "drizzle-orm";
import { rfpDb } from "@workspace/db";
import {
  opportunityIngestionRunsTable,
  opportunityIngestionRunSourcesTable,
} from "@workspace/db/schema/rfp";
import { INSIGHT_SOURCE_ARCHITECTURE } from "../lib/sourceArchitecture";
import { providerBudgetSnapshot } from "../lib/providerBudget";

const router = Router();

const BASE_BUDGET_NAMES = [
  "samGov",
  "tango",
  "langsearch",
  "langsearch:primary",
  "langsearch:secondary",
  "langsearch:tertiary",
  "serper",
  "exa",
  "parallel",
  "linkup",
  "you",
  "socrata",
  "websearch",
  "govcon:forecast",
  "govcon:recompete",
  "fco:forecast",
] as const;

async function ingestionPipeline(runId: string | undefined) {
  if (!runId) return null;
  const [run] = await rfpDb
    .select()
    .from(opportunityIngestionRunsTable)
    .where(eq(opportunityIngestionRunsTable.id, runId))
    .limit(1);
  if (!run) return { runId, found: false };

  const sources = await rfpDb
    .select()
    .from(opportunityIngestionRunSourcesTable)
    .where(eq(opportunityIngestionRunSourcesTable.runId, runId));

  return {
    runId,
    found: true,
    status: run.status,
    query: run.query ?? null,
    stages: {
      fetched: run.fetched,
      staged: run.staged,
      accepted: run.accepted,
      rejected: run.rejected,
      duplicates: run.duplicates,
      created: run.created,
      updated: run.updated,
      archived: run.archived,
    },
    providers: sources.map((source) => ({
      provider: source.provider,
      status: source.status,
      fetched: source.fetched,
      staged: source.staged,
      accepted: source.accepted,
      rejected: source.rejected,
      duplicates: source.duplicates,
      created: source.created,
      updated: source.updated,
      elapsedMs: source.elapsedMs ?? null,
      error: source.error ?? null,
    })),
    providersFailed: run.providersFailed,
    providersTimedOut: run.providersTimedOut,
    statusMessage: run.statusMessage ?? null,
    startedAt: run.startedAt ?? null,
    completedAt: run.completedAt ?? null,
  };
}

router.get("/hardening/diagnostics", async (req, res) => {
  const budgetNames = Array.from(
    new Set([
      ...BASE_BUDGET_NAMES,
      ...INSIGHT_SOURCE_ARCHITECTURE.filter(
        (source) => source.active && source.role === "ai_judge",
      ).map((source) => `judge:${source.name}`),
    ]),
  );

  const [budgets, pipeline] = await Promise.all([
    providerBudgetSnapshot(budgetNames),
    ingestionPipeline(
      typeof req.query.runId === "string" ? req.query.runId : undefined,
    ),
  ]);

  return res.json({
    generatedAt: new Date().toISOString(),
    architecture: INSIGHT_SOURCE_ARCHITECTURE,
    budgets: budgets.map((budget) => ({
      provider: budget.provider,
      policy: budget.policy,
      requestsToday: budget.requestsToday,
      requestsThisMonth: budget.requestsThisMonth,
      remainingToday: budget.remainingToday,
      remainingThisMonth: budget.remainingThisMonth,
      available: budget.available,
      successes: budget.successes,
      failures: budget.failures,
      usefulResults: budget.usefulResults,
      emptyResults: budget.emptyResults,
      coolingDown: budget.cooldownUntil > Date.now(),
      cooldownUntil:
        budget.cooldownUntil > Date.now()
          ? new Date(budget.cooldownUntil).toISOString()
          : null,
      lastOutcome: budget.lastOutcome ?? null,
      lastError: budget.lastError ?? null,
      lastAttemptAt: budget.lastAttemptAt ?? null,
      lastSuccessAt: budget.lastSuccessAt ?? null,
    })),
    pipeline,
  });
});

export default router;
