import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_EXTRACTION_PROVIDER_ORDER,
  shouldCrossCheckExtraction,
  type AiExtraction,
} from "../aiExtract";
import { normalizeCloudflareRerankScore } from "../../providers/cloudflareWorkersAi";
import {
  applySourceFairness,
  cosineSimilarity,
  finalizeSemanticPriority,
  titleTokenJaccard,
} from "../candidateSemanticPriority";
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
  it("uses Cloudflare before Cerebras, with Groq and Gemini as fallbacks", () => {
    assert.deepEqual(AI_EXTRACTION_PROVIDER_ORDER, [
      "cloudflare-workers-ai",
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

  it("computes semantic similarity and removes near-identical duplicate notices", () => {
    assert.equal(cosineSimilarity([1, 0], [1, 0]), 1);
    assert.ok(
      titleTokenJaccard(
        "Occupational Health Services Request for Proposals",
        "Request for Proposals - Occupational Health Services",
      ) > 0.8,
    );

    const result = finalizeSemanticPriority(
      [
        {
          title: "Occupational Health Services Request for Proposals",
          url: "https://example.gov/rfp/1",
          content: "Open RFP for employee medical surveillance and testing.",
          sourceProvider: "serper",
        },
        {
          title: "Request for Proposals Occupational Health Services",
          url: "https://mirror.example.gov/rfp/1",
          content: "Open RFP for employee medical surveillance and testing.",
          sourceProvider: "exa",
        },
        {
          title: "Fleet Vehicle Maintenance Bid",
          url: "https://example.gov/rfp/2",
          content: "Maintenance services for municipal vehicles.",
          sourceProvider: "serper",
        },
      ],
      [
        [1, 0],
        [0.999, 0.001],
        [0, 1],
      ],
      [1, 0],
      new Map([[0, 0.98]]),
      20,
    );

    assert.equal(result.applied, true);
    assert.equal(result.duplicatesRemoved, 1);
    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0]?.title, "Occupational Health Services Request for Proposals");
    assert.ok((result.candidates[0]?.cloudflareSemanticScore ?? 0) > 95);
  });

  it("prevents one close-scoring source from monopolizing the AI budget", () => {
    const ordered = applySourceFairness([
      ...Array.from({ length: 5 }, (_, index) => ({
        candidate: {
          title: `Serper ${index}`,
          url: `https://serper.example/${index}`,
          content: "occupational health procurement",
          sourceProvider: "serper",
        },
        finalScore: 0.99 - index * 0.01,
      })),
      {
        candidate: {
          title: "Exa candidate",
          url: "https://exa.example/1",
          content: "occupational health procurement",
          sourceProvider: "exa",
        },
        finalScore: 0.94,
      },
    ]);

    assert.equal(ordered[4]?.candidate.sourceProvider, "exa");
  });

  it("uses the full Occu-Med service profile for semantic search", () => {
    assert.match(OCCUMED_SEMANTIC_PROFILE, /occupational health/i);
    assert.match(OCCUMED_SEMANTIC_PROFILE, /audiograms/i);
    assert.match(OCCUMED_SEMANTIC_PROFILE, /respirator/i);
    assert.match(OCCUMED_SEMANTIC_PROFILE, /deployment medical/i);
  });
});
