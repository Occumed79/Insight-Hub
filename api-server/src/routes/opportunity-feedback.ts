import { Router } from "express";
import {
  submitGrade,
  getFeedbackForOpportunity,
  getModelSummary,
  reScoreAllOpportunities,
  type FeedbackGrade,
} from "../lib/learning/feedbackModel";

const router = Router();

const VALID_GRADES: FeedbackGrade[] = ["excellent", "good", "poor", "spam"];

/**
 * POST /api/opportunities/:id/feedback
 * Submit or update a grade for an opportunity.
 * Body: { grade: "excellent" | "good" | "poor" | "spam", notes?: string }
 */
router.post("/opportunities/:id/feedback", async (req, res) => {
  try {
    const { id } = req.params;
    const { grade, notes } = req.body as { grade?: string; notes?: string };

    if (!grade || !VALID_GRADES.includes(grade as FeedbackGrade)) {
      return res.status(400).json({
        error: `Invalid grade. Must be one of: ${VALID_GRADES.join(", ")}`,
      });
    }

    await submitGrade(id, grade as FeedbackGrade, notes);
    return res.json({ success: true, opportunityId: id, grade });
  } catch (err: any) {
    req.log.error(err);
    if (err.message?.includes("not found")) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: "Failed to submit feedback" });
  }
});

/**
 * GET /api/opportunities/:id/feedback
 * Get the existing grade for an opportunity (or null if ungraded).
 */
router.get("/opportunities/:id/feedback", async (req, res) => {
  try {
    const { id } = req.params;
    const feedback = await getFeedbackForOpportunity(id);
    return res.json({ feedback });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

/**
 * GET /api/opportunities/feedback/model-summary
 * Returns the current state of learned signal weights.
 * Useful for showing what the model has learned in the settings view.
 */
router.get("/opportunities/feedback/model-summary", async (_req, res) => {
  try {
    const summary = await getModelSummary();
    return res.json(summary);
  } catch (err) {
    _req.log.error(err);
    return res.status(500).json({ error: "Failed to build model summary" });
  }
});

/**
 * POST /api/opportunities/feedback/rescore
 * Manually trigger a full re-score of all opportunities.
 * (Normally happens automatically after each grade submission.)
 */
router.post("/opportunities/feedback/rescore", async (req, res) => {
  try {
    await reScoreAllOpportunities();
    return res.json({ success: true, message: "All opportunities re-scored." });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Re-score failed" });
  }
});

export default router;
