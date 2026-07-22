import assert from "node:assert/strict";
import test from "node:test";

import type { PublicPortalSource } from "../publicPortalProviders/catalog";
import {
  selectFairPortalSources,
  type PublicPortalSourceRunStatus,
} from "../publicPortalProviders/portalHealthStore";

function source(id: string): PublicPortalSource {
  return {
    id,
    agencyName: id,
    agencyType: "state",
    state: "CA",
    sourceUrl: `https://${id}.example.gov/bids`,
    domain: `${id}.example.gov`,
    sourceLevel: "state",
    scraperType: "existing_parser",
    enabled: true,
    verificationStatus: "verified",
  };
}

function status(
  sourceId: string,
  lastCheckedAt: string,
): PublicPortalSourceRunStatus {
  return {
    sourceId,
    lastCheckedAt: new Date(lastCheckedAt),
    resultCount: 0,
    matchedCount: 0,
    totalAttempts: 1,
    totalSuccesses: 0,
    totalFailures: 0,
    consecutiveFailures: 0,
    lastOutcome: "no_results",
  };
}

test("public portal selection caps dedicated adapters instead of launching all at once", () => {
  const sources = Array.from({ length: 20 }, (_, index) =>
    source(`dedicated-${String(index + 1).padStart(2, "0")}`),
  );
  const dedicatedIds = new Set(sources.map((item) => item.id));

  const selection = selectFairPortalSources(
    sources,
    new Map(),
    6,
    dedicatedIds,
  );

  assert.equal(selection.selected.length, 6);
  assert.equal(selection.deferred.length, 14);
  assert.deepEqual(
    selection.selected.map((item) => item.id),
    sources.slice(0, 6).map((item) => item.id),
  );
});

test("public portal selection reserves capacity for non-dedicated sources", () => {
  const dedicated = Array.from({ length: 8 }, (_, index) =>
    source(`dedicated-${index + 1}`),
  );
  const rotating = Array.from({ length: 8 }, (_, index) =>
    source(`rotating-${index + 1}`),
  );
  const sources = [...dedicated, ...rotating];

  const selection = selectFairPortalSources(
    sources,
    new Map(),
    8,
    new Set(dedicated.map((item) => item.id)),
  );

  assert.equal(selection.selected.length, 8);
  assert.equal(
    selection.selected.filter((item) => item.id.startsWith("dedicated-")).length,
    6,
  );
  assert.equal(
    selection.selected.filter((item) => item.id.startsWith("rotating-")).length,
    2,
  );
});

test("public portal selection sends oldest checked sources first on later runs", () => {
  const sources = [source("alpha"), source("bravo"), source("charlie")];
  const statuses = new Map<string, PublicPortalSourceRunStatus>([
    ["alpha", status("alpha", "2026-07-22T10:00:00.000Z")],
    ["bravo", status("bravo", "2026-07-20T10:00:00.000Z")],
    ["charlie", status("charlie", "2026-07-21T10:00:00.000Z")],
  ]);

  const selection = selectFairPortalSources(
    sources,
    statuses,
    2,
    new Set(),
  );

  assert.deepEqual(
    selection.selected.map((item) => item.id),
    ["bravo", "charlie"],
  );
  assert.deepEqual(selection.deferred.map((item) => item.id), ["alpha"]);
});
