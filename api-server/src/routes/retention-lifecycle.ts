import { Router } from "express";
import {
  applyRetentionLifecycle,
  previewRetentionLifecycle,
  RETENTION_POLICY_VERSION,
} from "../lib/retentionLifecycle";
import { adminReadAllowed } from "../middleware/api-hardening";

const router = Router();

router.get("/hardening/retention", async (req, res) => {
  if (!adminReadAllowed(req)) {
    return res.status(401).json({
      error: "Administrative read authorization is required.",
    });
  }

  try {
    return res.json(await previewRetentionLifecycle());
  } catch (error) {
    req.log.error({ error }, "Retention preview failed");
    return res.status(503).json({ error: "Retention preview is unavailable." });
  }
});

router.post("/hardening/retention/apply", async (req, res) => {
  const confirmation = req.body?.confirmation;
  if (confirmation !== `APPLY:${RETENTION_POLICY_VERSION}`) {
    return res.status(400).json({
      error: "Explicit retention confirmation is required.",
      expectedConfirmation: `APPLY:${RETENTION_POLICY_VERSION}`,
    });
  }

  try {
    return res.json(await applyRetentionLifecycle());
  } catch (error) {
    req.log.error({ error }, "Retention lifecycle apply failed");
    return res.status(503).json({ error: "Retention lifecycle could not be applied." });
  }
});

export default router;
