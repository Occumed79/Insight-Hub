import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runNativeDiscoveryRecallBenchmark } from "../benchmarks/nativeDiscoveryRecallBenchmark";

describe("native discovery recall benchmark", () => {
  it("compares prior search behavior with corrected native-first behavior and separates retrieval from authority", async () => {
    const report = await runNativeDiscoveryRecallBenchmark();
    assert.ok(
      report.correctedNativeFirstBehavior.candidateRetrievalRecall >
        report.priorSearchBehavior.candidateRetrievalRecall,
    );
    assert.equal(
      report.correctedNativeFirstBehavior.authoritativeVerificationRecall <
        report.correctedNativeFirstBehavior.candidateRetrievalRecall,
      true,
    );
    assert.ok(
      report.correctedNativeFirstBehavior.nativeVersusSearchFallbackDiscovery
        .searchFallback >= 1,
    );
  });
});
