import { Router } from "express";
import { INSIGHT_SOURCE_ARCHITECTURE } from "../lib/sourceArchitecture";
import { providerBudgetSnapshot } from "../lib/providerBudget";

const router = Router();

router.get("/hardening/diagnostics", async (_req, res) => {
  const budgetNames = Array.from(
    new Set([
      "samGov",
      "tango",
      "langsearch",
      "serper",
      "exa",
      "parallel",
      "linkup",
      "you",
      "socrata",
      "websearch",
      "govcon:forecast",
      "govcon:recompete",
      ...INSIGHT_SOURCE_ARCHITECTURE.filter(
        (source) => source.active && source.role === "ai_judge",
      ).map((source) => `judge:${source.name}`),
    ]),
  );

  const budgets = await providerBudgetSnapshot(budgetNames);
  return res.json({
    generatedAt: new Date().toISOString(),
    architecture: INSIGHT_SOURCE_ARCHITECTURE,
    budgets: budgets.map((budget) => ({
      provider: budget.provider,
      requestsToday: budget.requestsToday,
      requestsThisMonth: budget.requestsThisMonth,
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
  });
});

export default router;
