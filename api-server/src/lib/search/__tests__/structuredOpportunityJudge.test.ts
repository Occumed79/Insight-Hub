import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateJudgePanelVotes } from "../structuredOpportunityJudge";

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
});
