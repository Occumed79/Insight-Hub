import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  JAGGAER_COLLECTIBLE_PORTAL_IDS,
  JAGGAER_SCIQUEST_TENANTS,
  JaggaerSciQuestProvider,
  jaggaerSciQuestTenantProvider,
  parseJaggaerPublicEventHtml,
} from "../jaggaerSciQuest";

const LISTING_URL = "https://bids.sciquest.com/apps/Router/PublicEvent?CustomerOrg=DASIowa";

const FIXTURE = `
<html><body>
  <h2>Business Opportunities</h2>
  <div>Open</div>
  <a href="https://app01.jaggaer.com/apps/Router/ViewSourcingEvent?AuthToken=temporary&amp;tmstmp=123">Employee Occupational Health Services</a>
  <p>Statewide occupational health examinations and medical testing.</p>
  <div>Open</div><div>7/16/2026 12:00 AM CDT</div>
  <div>Close</div><div>8/7/2026 2:00 PM CDT</div>
  <div>Type</div><div>RFP</div>
  <div>Number</div><div>005-RFP-2909-2027</div>
  <div>Contact</div><div>Paul Manges paul.manges@das.iowa.gov</div>
  <div>Details</div>
  <a href="https://solutions-selectsite-documents.s3.amazonaws.com/005-RFP-2909-2027.pdf">View as PDF</a>
  <div>Respond Now</div>

  <div>Open</div>
  <a href="https://app01.jaggaer.com/apps/Router/ViewSourcingEvent?AuthToken=another">Mobile Medical Screening Services</a>
  <div>Open</div><div>7/10/2026 8:00 AM CDT</div>
  <div>Close</div><div>7/30/2026 2:00 PM CDT</div>
  <div>Type</div><div>RFQ</div>
  <div>Number</div><div>IA-MED-002</div>
  <div>Contact</div><div>Buyer buyer@iowa.gov</div>
  <div>Details</div>
  <a href="https://solutions-selectsite-documents.s3.amazonaws.com/IA-MED-002.pdf">View as PDF</a>
  <div>Respond Now</div>
</body></html>`;

describe("Jaggaer/SciQuest tenant configuration", () => {
  it("activates Iowa and leaves Ontario login-required", () => {
    assert.equal(JAGGAER_COLLECTIBLE_PORTAL_IDS.has("ia-das"), true);
    assert.equal(JAGGAER_COLLECTIBLE_PORTAL_IDS.has("ca-ontario-tenders"), false);
    assert.equal(
      JAGGAER_SCIQUEST_TENANTS.find((tenant) => tenant.portalId === "ca-ontario-tenders")?.capability,
      "login_required",
    );
  });

  it("creates a provider only for collectible tenants", () => {
    assert.ok(jaggaerSciQuestTenantProvider("ia-das"));
    assert.equal(jaggaerSciQuestTenantProvider("ca-ontario-tenders"), undefined);
  });
});

describe("Jaggaer/SciQuest public event parser", () => {
  it("parses public listing fields and PDF links", () => {
    const events = parseJaggaerPublicEventHtml(FIXTURE, LISTING_URL);
    assert.equal(events.length, 2);
    assert.equal(events[0]?.title, "Employee Occupational Health Services");
    assert.equal(events[0]?.solicitationNumber, "005-RFP-2909-2027");
    assert.equal(events[0]?.type, "RFP");
    assert.equal(events[0]?.contactEmail, "paul.manges@das.iowa.gov");
    assert.equal(
      events[0]?.publicDocumentUrl,
      "https://solutions-selectsite-documents.s3.amazonaws.com/005-RFP-2909-2027.pdf",
    );
    assert.match(events[0]?.description ?? "", /occupational health examinations/i);
  });

  it("produces tenant-scoped stable IDs through the provider", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(FIXTURE, {
      status: 200,
      headers: { "content-type": "text/html" },
    });
    try {
      const provider = new JaggaerSciQuestProvider([
        JAGGAER_SCIQUEST_TENANTS.find((tenant) => tenant.portalId === "ia-das")!,
      ]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(result.errors.length, 0);
      assert.equal(result.records.length, 2);
      assert.equal(result.records[0]?.externalId, "jaggaer-dasiowa-005-rfp-2909-2027");
      assert.equal(result.records[0]?.agency, "State of Iowa");
      assert.equal(result.records[0]?.rawData?.providerPlatform, "jaggaer_sciquest");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("filters by keywords without using discovery", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(FIXTURE, { status: 200 });
    try {
      const provider = new JaggaerSciQuestProvider([
        JAGGAER_SCIQUEST_TENANTS.find((tenant) => tenant.portalId === "ia-das")!,
      ]);
      const result = await provider.fetch({ keywords: "occupational", limit: 10 });
      assert.equal(result.records.length, 1);
      assert.equal(result.records[0]?.solicitationNumber, "005-RFP-2909-2027");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
