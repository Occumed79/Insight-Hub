import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_EXTRACTION_PROVIDER_ORDER,
  shouldCrossCheckExtraction,
  type AiExtraction,
} from "../aiExtract";
import { normalizeCloudflareRerankScore } from "../../providers/cloudflareWorkersAi";
import { OCCUMED_SEMANTIC_PROFILE } from "../semanticRerank";

function accepted(overrides: Partial<AiExtraction> = {}): AiExtraction {
  return {
    isOpportunity: true,
    title: "Occupational Health Services RFP",
    agency: "State Procurement Office",
    description:
      "Open procurement for pre-employment physical examinations, drug testing, audiograms, and respiratory fit testing.",
    deadline: "2026-09-01",
    relevanceScore: 88,
    relevanceReason: "Direct fit for Occu-Med services.",
    ...overrides,
  };
}

describe("coordinated AI search intelligence stack", () => {
  it("uses Cerebras as the normal extraction path", () => {
    assert.deepEqual(AI_EXTRACTION_PROVIDER_ORDER, [
      "cerebras",
      "groq",
      "gemini",
    ]);
  });

  it("cross-checks only ambiguous accepted records", () => {
    assert.equal(shouldCrossCheckExtraction(accepted()), false);
    assert.equal(
      shouldCrossCheckExtraction(accepted({ relevanceScore: 62 })),
      true,
    );
    assert.equal(
      shouldCrossCheckExtraction(accepted({ agency: undefined })),
      true,
    );
    assert.equal(
      shouldCrossCheckExtraction({
        isOpportunity: false,
        reason: "Award notice",
      }),
      false,
    );
  });

  it("normalizes Cloudflare reranker output to a stable 0..1 range", () => {
    assert.equal(normalizeCloudflareRerankScore(0.75), 0.75);
    assert.ok(normalizeCloudflareRerankScore(5) > 0.99);
    assert.ok(normalizeCloudflareRerankScore(-5) < 0.01);
    assert.equal(normalizeCloudflareRerankScore("not-a-number"), 0);
  });

  it("uses the full Occu-Med service profile for semantic search", () => {
    assert.match(OCCUMED_SEMANTIC_PROFILE, /occupational health/i);
    assert.match(OCCUMED_SEMANTIC_PROFILE, /audiograms/i);
    assert.match(OCCUMED_SEMANTIC_PROFILE, /respirator/i);
    assert.match(OCCUMED_SEMANTIC_PROFILE, /deployment medical/i);
  });
});
