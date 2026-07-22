import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NormalizedOpportunity } from "../providers/types";
import {
  ADAPTER_EVIDENCE_CLASS,
  evidenceStrengthFromStored,
  normalizeOpportunityEvidence,
} from "../opportunityEvidence";
import { classifyOpportunityQuality } from "../opportunityQuality";
import { normalizedToDbRecord } from "../search/normalization";

const now = new Date("2026-07-21T19:00:00Z");
const complete: NormalizedOpportunity = {
  externalId: "sam-1",
  title: "RFP Occupational Health Services",
  agency: "City of Example Health Department",
  type: "Solicitation",
  status: "active",
  postedDate: new Date("2026-07-01"),
  responseDeadline: new Date("2026-08-15"),
  description:
    "Official structured solicitation for occupational health services and drug testing.",
  sourceUrl: "https://sam.gov/opp/abc/view",
  source: "samGov",
  rawData: { providerName: "samGov" },
};

describe("centralized opportunity evidence normalization", () => {
  it("makes a complete trusted structured record verified-open after persistence mapping", () => {
    const db = normalizedToDbRecord(complete) as any;
    assert.equal(db.sourceConfidence, "high");
    assert.match(db.tags, /evidence:direct-structured/);
    assert.match(db.tags, /deadline:official_structured/);
    assert.match(db.tags, /complete-direct-evidence/);
    assert.equal(
      classifyOpportunityQuality(db, now).classification,
      "verified-open",
    );
    assert.equal(classifyOpportunityQuality(db, now).summaryEligible, true);
  });

  it("preserves buyer and deadline provenance in the stored shape", () => {
    const db = normalizedToDbRecord(complete) as any;
    assert.equal(db.agency, "City of Example Health Department");
    assert.deepEqual(db.responseDeadline, new Date("2026-08-15"));
    assert.match(db.notes, /buyer=official_structured/);
    assert.match(db.notes, /deadline=official_structured/);
  });

  it("recognizes a dedicated shared-platform adapter from its raw platform metadata", () => {
    const db = normalizedToDbRecord({
      ...complete,
      externalId: "opengov-100",
      source: "publicPortalProviders",
      sourceUrl: "https://procurement.opengov.com/portal/example/projects/100",
      rawData: {
        providerPlatform: "opengov",
        discoveryMethod: "dedicated_official_adapter",
        nativeOpportunityId: "100",
        sourceConfidence: "high",
      },
    }) as any;
    assert.match(db.tags, /evidence:direct-structured/);
    assert.equal(db.sourceConfidence, "high");
    assert.equal(
      classifyOpportunityQuality(db, now).classification,
      "verified-open",
    );
  });

  it("accepts a direct adapter's native external ID when its detail URL has a provider-specific shape", () => {
    const db = normalizedToDbRecord({
      ...complete,
      externalId: "ny-scr-CR-100",
      source: "nyScr",
      sourceUrl: "https://www.nyscr.ny.gov/adsOpen.cfm?ID=100",
      rawData: {
        discoveryMethod: "direct_official_listing",
        sourceConfidence: "high",
      },
    }) as any;
    assert.match(db.tags, /direct-solicitation-url/);
    assert.match(db.tags, /complete-direct-evidence/);
    assert.equal(
      classifyOpportunityQuality(db, now).classification,
      "verified-open",
    );
  });

  it("does not promote Serper discovery disguised by the public-portal source bucket", () => {
    const db = normalizedToDbRecord({
      ...complete,
      externalId: "portal-search-1",
      source: "publicPortalProviders",
      sourceUrl: "https://example.gov/bids/occupational-health",
      rawData: {
        providerName: "publicPortalProviders",
        discoveryMethod: "serper_official_domain",
        sourceConfidence: "medium",
        tags: [
          "official-procurement-portal",
          "serper-discovery",
          "verification-required",
        ],
      },
    }) as any;
    assert.equal(db.sourceConfidence, "low");
    assert.match(db.tags, /evidence:discovery/);
    assert.doesNotMatch(db.tags, /complete-direct-evidence/);
    assert.equal(
      classifyOpportunityQuality(db, now).classification,
      "discovery-only",
    );
  });

  it("keeps landing pages, missing buyers, and missing deadlines non-actionable", () => {
    const landing = normalizedToDbRecord({
      ...complete,
      externalId: "landing",
      source: "publicPortalProviders",
      agency: "State Agency",
      sourceUrl: "https://example.gov/procurement-opportunities",
      rawData: { evidenceType: "landing-page" },
    }) as any;
    assert.notEqual(
      classifyOpportunityQuality(landing, now).classification,
      "verified-open",
    );

    const missingBuyer = normalizedToDbRecord({
      ...complete,
      agency: "Unknown",
    }) as any;
    assert.equal(
      classifyOpportunityQuality(missingBuyer, now).classification,
      "needs-verification",
    );

    const missingDeadline = normalizedToDbRecord({
      ...complete,
      responseDeadline: undefined,
    }) as any;
    assert.equal(
      classifyOpportunityQuality(missingDeadline, now).classification,
      "needs-verification",
    );
  });

  it("does not promote an authoritative-page snippet without extracted content", () => {
    const db = normalizedToDbRecord({
      ...complete,
      source: "publicPortalProviders",
      description: "Short search snippet",
      sourceUrl: "https://example.gov/bids/100",
      rawData: { evidenceType: "authoritative-page" },
    }) as any;
    assert.equal(db.sourceConfidence, "low");
    assert.doesNotMatch(db.tags, /complete-direct-evidence/);
    assert.equal(
      classifyOpportunityQuality(db, now).classification,
      "needs-verification",
    );
  });

  it("keeps weaker evidence below stronger canonical evidence", () => {
    const strong = normalizedToDbRecord(complete) as any;
    const weak = normalizedToDbRecord({
      ...complete,
      source: "serper",
      rawData: { providerName: "serper", fallback: true },
    }) as any;
    assert.ok(
      evidenceStrengthFromStored(strong) > evidenceStrengthFromStored(weak),
    );
  });

  it("maps the required adapter families", () => {
    assert.equal(ADAPTER_EVIDENCE_CLASS.samGov, "direct-structured");
    assert.equal(ADAPTER_EVIDENCE_CLASS.opengov, "direct-structured");
    assert.equal(ADAPTER_EVIDENCE_CLASS.bonfire_euna, "direct-structured");
    assert.equal(ADAPTER_EVIDENCE_CLASS.jaggaer_sciquest, "direct-structured");
    assert.equal(ADAPTER_EVIDENCE_CLASS.ionwave_euna, "direct-structured");
    assert.equal(ADAPTER_EVIDENCE_CLASS.bso, "direct-structured");
    assert.equal(ADAPTER_EVIDENCE_CLASS.bidExpress, "direct-structured");
    assert.equal(ADAPTER_EVIDENCE_CLASS.publicPurchase, "direct-structured");
    assert.equal(ADAPTER_EVIDENCE_CLASS.serper, "discovery");
    assert.equal(ADAPTER_EVIDENCE_CLASS.exa, "discovery");
  });

  it("reports discovery evidence before persistence", () => {
    const profile = normalizeOpportunityEvidence({
      ...complete,
      source: "serper",
      rawData: { providerName: "serper", fallback: true },
    });
    assert.equal(profile.evidenceType, "discovery");
    assert.equal(profile.sourceConfidence, "low");
    assert.equal(profile.completeDirectEvidence, false);
  });
});
