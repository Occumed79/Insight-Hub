import { Router } from "express";
import {
  getCurrentIngestionRun,
  getIngestionRun,
} from "../lib/ingestion/manualIngestion";
import { getIngestionRejectionDiagnostics } from "../lib/ingestion/rejectionDiagnosticsStore";

const router = Router();

function disableCaching(res: Parameters<Parameters<typeof router.get>[1]>[1]): void {
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

router.get("/opportunities/ingestion-runs/current", async (req, res) => {
  try {
    disableCaching(res);
    const run = await getCurrentIngestionRun();
    if (!run) return res.json({ run: null });
    const rejectionDiagnostics = await getIngestionRejectionDiagnostics(run.id);
    return res.json({ run: { ...run, rejectionDiagnostics } });
  } catch (err) {
    req.log.error(err);
    return res
      .status(500)
      .json({ error: "Failed to read the current ingestion run" });
  }
});

router.get(
  "/opportunities/ingestion-runs/:runId/rejection-diagnostics",
  async (req, res) => {
    try {
      disableCaching(res);
      const run = await getIngestionRun(req.params.runId);
      if (!run) return res.status(404).json({ error: "Ingestion run not found" });
      return res.json({
        runId: run.id,
        diagnostics: await getIngestionRejectionDiagnostics(run.id),
      });
    } catch (err) {
      req.log.error(err);
      return res
        .status(500)
        .json({ error: "Failed to read ingestion rejection diagnostics" });
    }
  },
);

export default router;
