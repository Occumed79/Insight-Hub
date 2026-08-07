import { Router } from "express";
import {
  getDatabaseConfigSummary,
  rfpPool,
  verifyRfpDatabase,
} from "@workspace/db";

const router = Router();

router.get("/database-status", async (req, res) => {
  try {
    const routing = await verifyRfpDatabase();
    const rfpResult = await rfpPool.query<{
      opportunities: number;
    }>("SELECT COUNT(*)::int AS opportunities FROM public.opportunities");

    return res.json({
      ok: true,
      service: "insight-hub-procurement",
      config: getDatabaseConfigSummary(),
      roles: routing.roles,
      counts: {
        rfp: rfpResult.rows[0] ?? { opportunities: 0 },
      },
      transferredDependencies: {
        intel: {
          requiredForReadiness: false,
          owner: "Insight-Hub2.0",
        },
      },
    });
  } catch (error) {
    req.log.error({ error }, "Procurement database status check failed");
    return res.status(503).json({
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Procurement database unavailable",
      config: getDatabaseConfigSummary(),
    });
  }
});

export default router;
