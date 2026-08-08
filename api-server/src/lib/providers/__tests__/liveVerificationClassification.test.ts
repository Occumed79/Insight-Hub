import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyLiveVerificationResult,
  isFatalLiveVerificationStatus,
} from "../liveVerificationClassification";

function classify(errors: string[] = [], records = 0) {
  return classifyLiveVerificationResult({
    records: Array.from({ length: records }, () => ({} as never)),
    errors,
  });
}

test("live verification distinguishes healthy, challenged, transient, endpoint, and parser states", () => {
  assert.equal(classify([], 2), "PASS");
  assert.equal(classify([]), "HEALTHY_EMPTY");
  assert.equal(
    classify([
      "ks-esupplier: browser/login challenge — public Kansas eSupplier redirects fresh HTTP sessions to errorCode=999",
    ]),
    "BLOCKED_CHALLENGE",
  );
  assert.equal(classify(["Timed out after 25000ms"]), "REQUEST_FAILURE");
  assert.equal(classify(["connect ETIMEDOUT 203.0.113.10:443"]), "REQUEST_FAILURE");
  assert.equal(classify(["HTTP 404 Not Found"]), "BAD_ENDPOINT");
  assert.equal(
    classify(["PeopleSoft public routes returned no parseable opportunity rows"]),
    "PARSER_FAILURE",
  );
});

test("only structural live-source failures are fatal", () => {
  assert.equal(isFatalLiveVerificationStatus("PASS"), false);
  assert.equal(isFatalLiveVerificationStatus("HEALTHY_EMPTY"), false);
  assert.equal(isFatalLiveVerificationStatus("BLOCKED_CHALLENGE"), false);
  assert.equal(isFatalLiveVerificationStatus("REQUEST_FAILURE"), false);
  assert.equal(isFatalLiveVerificationStatus("BAD_ENDPOINT"), true);
  assert.equal(isFatalLiveVerificationStatus("PARSER_FAILURE"), true);
});
