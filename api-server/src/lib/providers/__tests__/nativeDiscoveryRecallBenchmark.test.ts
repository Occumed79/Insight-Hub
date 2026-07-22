import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runNativeDiscoveryRecallBenchmark } from "../benchmarks/nativeDiscoveryRecallBenchmark";

describe("native discovery recall benchmark", () => {
  it("reports measurable before-and-after recall improvement and direct verification", async () => {
    const report = await runNativeDiscoveryRecallBenchmark();
    assert.ok(report.after.recall > report.before.recall);
    assert.ok(
      report.after.directVerificationRate >
        report.before.directVerificationRate,
    );
    assert.ok(
      report.after.nativeVersusSearchFallbackDiscovery.native >
        report.after.nativeVersusSearchFallbackDiscovery.searchFallback,
    );
  });
});
