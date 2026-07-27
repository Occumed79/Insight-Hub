import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { DirectRfpPortal } from "../directRfpPortals";
import {
  auditDirectRfpCatalogue,
  canonicalCatalogueUrl,
} from "../catalogueQualityAudit";

function portal(
  id: string,
  overrides: Partial<DirectRfpPortal> = {},
): DirectRfpPortal {
  return {
    id,
    name: `Portal ${id}`,
    jurisdiction: `Jurisdiction ${id}`,
    state: "CA",
    country: "US",
    level: "district",
    url: `https://${id}.example.gov/procurement`,
    searchUrl: `https://${id}.example.gov/bids`,
    domain: `${id}.example.gov`,
    accessMode: "public_html",
    requiresKey: false,
    requiresLogin: false,
    tier: 3,
    parserStatus: "catalog_only",
    notes: "Official current bids page.",
    ...overrides,
  };
}

describe("catalogue quality audit", () => {
  it("normalizes equivalent URLs before duplicate detection", () => {
    assert.equal(
      canonicalCatalogueUrl(
        "https://WWW.Example.gov/bids/?utm_source=test&b=2&a=1#open",
      ),
      "https://example.gov/bids?a=1&b=2",
    );
  });

  it("detects duplicate endpoints, domain errors, and unsupported parser claims", () => {
    const report = auditDirectRfpCatalogue(
      [
        portal("one", {
          jurisdiction: "Shared Buyer",
          searchUrl: "https://procurement.example.gov/bids",
          domain: "wrong.example.gov",
          parserStatus: "ready_to_parse",
        }),
        portal("two", {
          jurisdiction: "Different Buyer",
          searchUrl: "https://procurement.example.gov/bids/",
          domain: "procurement.example.gov",
        }),
      ],
      "2026-07-27T00:00:00.000Z",
    );

    assert.ok(
      report.findings.some(
        (item) => item.code === "CENTRALIZED_SOURCE_DUPLICATED_AS_BUYERS",
      ),
    );
    assert.ok(
      report.findings.some((item) => item.code === "DOMAIN_MISMATCH"),
    );
    assert.ok(
      report.findings.some(
        (item) => item.code === "READY_STATUS_WITHOUT_RUNTIME_ADAPTER",
      ),
    );
  });

  it("requires evidence for verified-high relevance", () => {
    const report = auditDirectRfpCatalogue([
      portal("evidence", {
        occumedFit: "verified_high",
        relevanceEvidence: [],
        relevanceEvidenceUrls: [],
      }),
    ]);
    assert.ok(
      report.findings.some(
        (item) => item.code === "RELEVANCE_EVIDENCE_MISSING",
      ),
    );
  });
});
