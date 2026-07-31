import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aggregateJudgePanelVotes,
  shouldSplitStructuredJudgeBatch,
  structuredJudgeFailureCooldownMs,
  STRUCTURED_JUDGE_PROVIDER_ORDER,
} from "../structuredOpportunityJudge";

describe("structured RFP judge panel", () => {
  it("requires two independent approvals", () => {
    const oneJudge = aggregateJudgePanelVotes([
      {
        judge: "cerebras",
        isOpportunity: true,
        relevanceScore: 96,
        reason: "Core occupational health scope.",
      },
    ]);
    assert.equal(oneJudge.approved, false);

    const twoJudges = aggregateJudgePanelVotes([
      {
        judge: "cerebras",
        isOpportunity: true,
        relevanceScore: 91,
        reason: "Core occupational health scope.",
      },
      {
        judge: "groq",
        isOpportunity: true,
        relevanceScore: 84,
        reason: "Buyer is purchasing employee medical examinations.",
      },
    ]);
    assert.equal(twoJudges.approved, true);
    assert.equal(twoJudges.yesVotes, 2);
  });

  it("rejects a split two-judge verdict and uses majority when a tie-breaker exists", () => {
    const split = aggregateJudgePanelVotes([
      {
        judge: "cerebras",
        isOpportunity: true,
        relevanceScore: 90,
        reason: "Potential medical scope.",
      },
      {
        judge: "groq",
        isOpportunity: false,
        relevanceScore: 5,
        reason: "Medical wording is only incidental boilerplate.",
      },
    ]);
    assert.equal(split.approved, false);

    const majority = aggregateJudgePanelVotes([
      {
        judge: "cerebras",
        isOpportunity: true,
        relevanceScore: 90,
        reason: "Core occupational health scope.",
      },
      {
        judge: "groq",
        isOpportunity: false,
        relevanceScore: 5,
        reason: "Ambiguous scope.",
      },
      {
        judge: "gemini",
        isOpportunity: true,
        relevanceScore: 82,
        reason: "The purchased scope includes medical surveillance.",
      },
    ]);
    assert.equal(majority.approved, true);
    assert.equal(majority.yesVotes, 2);
  });

  it("rejects low-confidence approvals even when two judges say yes", () => {
    const lowConfidence = aggregateJudgePanelVotes([
      {
        judge: "cerebras",
        isOpportunity: true,
        relevanceScore: 64,
        reason: "Weak possible fit.",
      },
      {
        judge: "groq",
        isOpportunity: true,
        relevanceScore: 67,
        reason: "Medical terms are present but scope is unclear.",
      },
    ]);
    assert.equal(lowConfidence.approved, false);
  });

  it("prioritizes the reliable judge pair before optional fallbacks", () => {
    assert.deepEqual(STRUCTURED_JUDGE_PROVIDER_ORDER.slice(0, 3), [
      "cerebras",
      "groq",
      "openrouter",
    ]);
    assert.ok(
      STRUCTURED_JUDGE_PROVIDER_ORDER.indexOf("gemini") >
        STRUCTURED_JUDGE_PROVIDER_ORDER.indexOf("mistral"),
    );
    assert.ok(
      STRUCTURED_JUDGE_PROVIDER_ORDER.indexOf("deepseek") >
        STRUCTURED_JUDGE_PROVIDER_ORDER.indexOf("nvidia"),
    );
  });

  it("splits oversized or incomplete model batches instead of discarding them", () => {
    assert.equal(
      shouldSplitStructuredJudgeBatch(
        new Error("Groq error 413: Request too large for model"),
      ),
      true,
    );
    assert.equal(
      shouldSplitStructuredJudgeBatch(
        new Error("mistral returned only 0/4 panel decisions"),
      ),
      true,
    );
    assert.equal(
      shouldSplitStructuredJudgeBatch(new Error("NVIDIA returned malformed panel JSON")),
      true,
    );
    assert.equal(
      shouldSplitStructuredJudgeBatch(new Error("API key not valid")),
      false,
    );
  });

  it("cools invalid or exhausted keys longer than transient failures", () => {
    const terminal = structuredJudgeFailureCooldownMs(
      new Error("Gemini API error 400: API key not valid"),
    );
    const depleted = structuredJudgeFailureCooldownMs(
      new Error("DeepSeek error 402: Insufficient Balance"),
    );
    const rateLimited = structuredJudgeFailureCooldownMs(
      new Error("HTTP 429 rate limit exceeded"),
    );
    const transient = structuredJudgeFailureCooldownMs(
      new Error("upstream connection reset"),
    );

    assert.equal(terminal, depleted);
    assert.ok(terminal > rateLimited);
    assert.ok(rateLimited > transient);
    assert.ok(transient > 0);
  });
});
