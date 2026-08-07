import { Router } from "express";
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
const FEEDBACK_GRADES = new Set<FeedbackGrade>([
  "excellent",
  "good",
  "poor",
  "spam",
]);

function parseFeedbackBody(value: unknown):
  | {
      success: true;
      data: {
        grade: FeedbackGrade;
        notes?: string;
        queryContext?: string;
      };
    }
  | {
      success: false;
      issues: Array<{ path: string; message: string }>;
    } {
  const body =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const issues: Array<{ path: string; message: string }> = [];

  const grade = typeof body.grade === "string" ? body.grade : "";
  if (!FEEDBACK_GRADES.has(grade as FeedbackGrade)) {
    issues.push({
      path: "grade",
      message: "grade must be excellent, good, poor, or spam",
    });
  }

  const notes = body.notes;
  if (notes !== undefined && typeof notes !== "string") {
    issues.push({ path: "notes", message: "notes must be a string" });
  } else if (typeof notes === "string" && notes.length > 2_000) {
    issues.push({ path: "notes", message: "notes must be 2000 characters or fewer" });
  }

  const queryContext = body.queryContext;
  if (queryContext !== undefined && typeof queryContext !== "string") {
    issues.push({
      path: "queryContext",
      message: "queryContext must be a string",
    });
  } else if (typeof queryContext === "string" && queryContext.length > 240) {
    issues.push({
      path: "queryContext",
      message: "queryContext must be 240 characters or fewer",
    });
  }

  if (issues.length > 0) return { success: false, issues };
  return {
    success: true,
    data: {
      grade: grade as FeedbackGrade,
      ...(typeof notes === "string" ? { notes } : {}),
      ...(typeof queryContext === "string" ? { queryContext } : {}),
    },
  };
}

/** Submit/update feedback and persist both the global and contextual model. */
router.post("/opportunities/:id/feedback", async (req, res) => {
  try {
    const parsed = parseFeedbackBody(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: "Invalid feedback payload.",
        issues: parsed.issues,
      });
    }

    const { id } = req.params;
    const { grade, notes, queryContext } = parsed.data;
    await submitGrade(id, grade, notes);
    const context = await recordContextFeedback(id, grade, queryContext);
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
