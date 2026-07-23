import assert from "node:assert/strict";
import test from "node:test";

import {
  buildApprovedDiscoverySpiderConfig,
  type ReviewDiscoveryCandidateInput,
  type StoredDiscoveryCandidate,
} from "../discoveryCandidateStore";

function candidate(
  overrides: Partial<StoredDiscoveryCandidate> = {},
): StoredDiscoveryCandidate {
  return {
    sourceId: "state-portal",
    spiderId: "browser-state-portal",
    endpointUrl: "https://api.state.gov/opportunities",
    pageUrl: "https://procurement.state.gov/bids",
    method: "GET",
    responseContentType: "application/json",
    paginationMechanism: "page",
    queryParameters: ["page", "limit"],
    candidateIdentifierFields: ["noticeId"],
    candidateTitleFields: ["title"],
    candidateStatusFields: ["status"],
    candidateDateFields: [
      "postedDate",
      "createdAt",
      "closingDate",
      "responseDeadline",
    ],
    candidateDetailLinkFields: ["detailUrl"],
    state: "candidate",
    firstSeenAt: "2026-07-22T00:00:00.000Z",
    lastSeenAt: "2026-07-22T00:00:00.000Z",
    ...overrides,
  };
}

function approval(
  config: ReviewDiscoveryCandidateInput["config"] = {},
): ReviewDiscoveryCandidateInput {
  return {
    sourceId: "state-portal",
    endpointUrl: "https://api.state.gov/opportunities",
    decision: "approved",
    config,
  };
}

test("approved public JSON spiders reject secret-bearing headers", () => {
  assert.throws(
    () =>
      buildApprovedDiscoverySpiderConfig(
        candidate(),
        approval({ headers: { Authorization: "Bearer secret" } }),
      ),
    /cannot store sensitive header Authorization/i,
  );
  assert.throws(
    () =>
      buildApprovedDiscoverySpiderConfig(
        candidate(),
        approval({ headers: { "X-API-Key": "secret" } }),
      ),
    /cannot store sensitive header X-API-Key/i,
  );
});

test("candidate date fields are separated into posted and deadline mappings", () => {
  const config = buildApprovedDiscoverySpiderConfig(candidate(), approval());
  assert.ok(config.fields.postedDate?.includes("postedDate"));
  assert.ok(config.fields.postedDate?.includes("createdAt"));
  assert.equal(config.fields.postedDate?.includes("closingDate"), false);
  assert.equal(config.fields.postedDate?.includes("responseDeadline"), false);

  assert.ok(config.fields.responseDeadline?.includes("closingDate"));
  assert.ok(config.fields.responseDeadline?.includes("responseDeadline"));
  assert.equal(config.fields.responseDeadline?.includes("postedDate"), false);
  assert.equal(config.fields.responseDeadline?.includes("createdAt"), false);
});

test("approved POST spiders require an explicit public request body", () => {
  assert.throws(
    () =>
      buildApprovedDiscoverySpiderConfig(
        candidate({ method: "POST" }),
        approval({ method: "POST" }),
      ),
    /requires an explicit request body template/i,
  );
});

test("approved candidate hosts remain explicit and bounded", () => {
  const config = buildApprovedDiscoverySpiderConfig(
    candidate(),
    approval({ allowedHosts: ["documents.state.gov"] }),
  );
  assert.deepEqual(config.allowedHosts, [
    "api.state.gov",
    "procurement.state.gov",
    "documents.state.gov",
  ]);
  assert.equal(config.kind, "json_endpoint");
  assert.equal(config.pagination?.mode, "page");
});
