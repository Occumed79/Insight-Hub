import { Router } from "express";
import {
  getDatabaseConfigSummary,
  intelPool,
  rfpPool,
  verifyDatabaseRouting,
} from "@workspace/db";

const router = Router();

router.get("/database-status", async (req, res) => {
  try {
    const routing = await verifyDatabaseRouting();
    const [rfpResult, intelResult] = await Promise.all([
      rfpPool.query<{
        opportunities: number;
      }>("SELECT COUNT(*)::int AS opportunities FROM public.opportunities"),
      intelPool.query<{
        competitors: number;
        prospects: number;
        clients: number;
        federal_intel_items: number;
      }>(`
        SELECT
          (SELECT COUNT(*)::int FROM public.competitors) AS competitors,
          (SELECT COUNT(*)::int FROM public.prospects) AS prospects,
          (SELECT COUNT(*)::int FROM public.clients) AS clients,
          (SELECT COUNT(*)::int FROM public.federal_intel_items) AS federal_intel_items
      `),
    ]);

    return res.json({
      ok: true,
      config: routing.config,
      roles: routing.roles,
      counts: {
        rfp: rfpResult.rows[0] ?? { opportunities: 0 },
        intel: intelResult.rows[0] ?? {
          competitors: 0,
          prospects: 0,
          clients: 0,
          federal_intel_items: 0,
        },
      },
    });
  } catch (error) {
    req.log.error({ error }, "Database status check failed");
    return res.status(503).json({
      ok: false,
      error: error instanceof Error ? error.message : "Database routing unavailable",
      config: getDatabaseConfigSummary(),
    });
  }
});

export default router;
