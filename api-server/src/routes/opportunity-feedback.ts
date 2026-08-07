import { Router } from "express";
import { z } from "zod/v4";
import {
  submitGrade,
  getFeedbackForOpportunity,
  getModelSummary,
  reScoreAllOpportunities,
  type FeedbackGrade,
} from "../lib/learning/feedbackModel";
import {
  contextualFeedbackSummary,
  recordContextFeedback,
} from "../lib/learning/contextualFeedback";

const router = Router();

const feedbackBodySchema = z.object({
  grade: z.enum(["excellent", "good", "poor", "spam"]),
  notes: z.string().max(2_000).optional(),
  queryContext: z.string().max(240).optional(),
});

/** Submit/update feedback and persist both the global and contextual model. */
router.post("/opportunities/:id/feedback", async (req, res) => {
  try {
    const parsed = feedbackBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid feedback payload.",
        issues: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    const { id } = req.params;
    const { grade, notes, queryContext } = parsed.data;
    await submitGrade(id, grade as FeedbackGrade, notes);
    const context = await recordContextFeedback(
      id,
      grade as FeedbackGrade,
      queryContext,
    );
    return res.json({
      success: true,
      opportunityId: id,
      grade,
      learningContext: context,
    });
  } catch (err: any) {
    req.log.error(err);
    if (err.message?.includes("not found")) {
      return res.status(404).json({ error: err.message });
    }
    return res.status(500).json({ error: "Failed to submit feedback" });
  }
});

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

/** Global model plus an optional exact query-context model for diagnostics. */
router.get("/opportunities/feedback/model-summary", async (req, res) => {
  try {
    const [summary, contextual] = await Promise.all([
      getModelSummary(),
      contextualFeedbackSummary(
        typeof req.query.context === "string" ? req.query.context : undefined,
      ),
    ]);
    return res.json({ ...summary, contextual });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Failed to build model summary" });
  }
});

router.post("/opportunities/feedback/rescore", async (req, res) => {
  try {
    const { updated } = await reScoreAllOpportunities();
    return res.json({
      success: true,
      message: "All opportunities re-scored.",
      updated,
    });
  } catch (err) {
    req.log.error(err);
    return res.status(500).json({ error: "Re-score failed" });
  }
});

export default router;
