import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  IONWAVE_TENANTS,
  IONWAVE_COLLECTIBLE_PORTAL_IDS,
  IonWavePortalProvider,
  ionWaveTenantProvider,
  parseIonWaveListingHtml,
} from "../ionWavePortal";

// Realistic IonWave listing fixture based on actual blounttn.ionwave.net HTML structure.
// Matches the Telerik RadGrid format: rows with BidNumber, Title, Type, Org, OpenDate, CloseDate.
const ACTIVE_FIXTURE = `
<html><head>
  <title>Current Bids - Blount County</title>
</head><body>
  <script>
    $create(Telerik.Web.UI.RadGrid, {
      "_clientKeyValues":{"0":{"BidID":"962"},"1":{"BidID":"963"},"2":{"BidID":"930"}},"_controlToFocus":"","foo":"bar"
    });
  </script>
  <table>
    <tr class="rgRow" valign="top" id="ctl00_mainContent_rgBidList_ctl00__0">
      <td><span title="View Bid"></span></td>
      <td valign="top">2026-0130</td>
      <td valign="top">Concrete (Ready-Mix)</td>
      <td valign="top">ITB</td>
      <td valign="top" style="display:none;">Purchasing</td>
      <td valign="top">7/7/2026</td>
      <td valign="top">7/30/2026 01:30:00 PM (ET)</td>
    </tr>
    <tr class="rgAltRow" valign="top" id="ctl00_mainContent_rgBidList_ctl00__1">
      <td><span title="View Bid"></span></td>
      <td valign="top">2026-0133</td>
      <td valign="top">Guardrail Services for Blount County, TN</td>
      <td valign="top">ITB</td>
      <td valign="top" style="display:none;">Purchasing</td>
      <td valign="top">7/7/2026</td>
      <td valign="top">7/30/2026 03:00:00 PM (ET)</td>
    </tr>
    <tr class="rgRow" valign="top" id="ctl00_mainContent_rgBidList_ctl00__2">
      <td><span title="View Bid"></span></td>
      <td valign="top">2026-0059</td>
      <td valign="top">Visual Stream Assessment</td>
      <td valign="top">RFP</td>
      <td valign="top" style="display:none;">Purchasing</td>
      <td valign="top">7/7/2026</td>
      <td valign="top">8/11/2026 01:30:00 PM (ET)</td>
    </tr>
  </table>
</body></html>`;

// A "closed bids" page fixture (SourceType=2) — our adapter only fetches SourceType=1
// This is provided as a reference; we do not return closed bids as active.
const CLOSED_FIXTURE = `
<html><body>
  <script>
    $create(Telerik.Web.UI.RadGrid, {
      "_clientKeyValues":{"0":{"BidID":"800"}},"_controlToFocus":"","foo":"bar"
    });
  </script>
  <table>
    <tr class="rgRow" valign="top" id="ctl00_mainContent_rgBidList_ctl00__0">
      <td></td>
      <td>2025-0099</td>
      <td>IT Equipment Refresh (CLOSED)</td>
      <td>ITB</td>
      <td style="display:none;">IT</td>
      <td>1/1/2025</td>
      <td>2/1/2025 12:00:00 PM (ET)</td>
    </tr>
  </table>
</body></html>`;

// An empty listing (no open bids)
const EMPTY_FIXTURE = `
<html><body>
  <script>
    $create(Telerik.Web.UI.RadGrid, {
      "_clientKeyValues":{},"_controlToFocus":"","foo":"bar"
    });
  </script>
  <table><tr class="rgHeader"><th>Bid Number</th></tr></table>
</body></html>`;

// Fixture with no open date (unknown posted date)
const UNKNOWN_DATE_FIXTURE = `
<html><body>
  <script>
    $create(Telerik.Web.UI.RadGrid, {
      "_clientKeyValues":{"0":{"BidID":"555"}},"_controlToFocus":"","foo":"bar"
    });
  </script>
  <table>
    <tr class="rgRow" valign="top" id="ctl00_mainContent_rgBidList_ctl00__0">
      <td></td>
      <td>2026-0200</td>
      <td>Medical Surveillance Services RFP</td>
      <td>RFP</td>
      <td style="display:none;">Health</td>
      <td></td>
      <td>9/30/2026 05:00:00 PM (ET)</td>
    </tr>
  </table>
</body></html>`;

const BLOUNT_TENANT = IONWAVE_TENANTS.find((t) => t.portalId === "tn-blount-county")!;

describe("IonWave tenant configuration", () => {
  it("activates Blount County with tenant ID extracted from official county page", () => {
    assert.ok(BLOUNT_TENANT, "Blount County tenant must exist");
    assert.equal(BLOUNT_TENANT.tenantId, "blounttn");
    assert.equal(BLOUNT_TENANT.buyerName, "Blount County");
    assert.equal(BLOUNT_TENANT.state, "TN");
    assert.equal(BLOUNT_TENANT.listingUrl, "https://blounttn.ionwave.net/SourcingEvents.aspx?SourceType=1");
    assert.equal(BLOUNT_TENANT.origin, "https://blounttn.ionwave.net");
  });

  it("registers Blount County as a collectible portal ID", () => {
    assert.ok(IONWAVE_COLLECTIBLE_PORTAL_IDS.has("tn-blount-county"));
  });

  it("creates a provider for Blount County via tenant factory", () => {
    const provider = ionWaveTenantProvider("tn-blount-county");
    assert.ok(provider, "Provider must be created for a known tenant");
    assert.equal(ionWaveTenantProvider("nonexistent-portal"), undefined);
  });
});

describe("IonWave listing HTML parser", () => {
  it("parses three rows from a real-world fixture", () => {
    const rows = parseIonWaveListingHtml(ACTIVE_FIXTURE);
    assert.equal(rows.length, 3);
  });

  it("extracts BidID from Telerik client key values", () => {
    const rows = parseIonWaveListingHtml(ACTIVE_FIXTURE);
    assert.equal(rows[0]?.bidId, "962");
    assert.equal(rows[1]?.bidId, "963");
    assert.equal(rows[2]?.bidId, "930");
  });

  it("extracts solicitation number, title, type, and dates", () => {
    const rows = parseIonWaveListingHtml(ACTIVE_FIXTURE);
    const first = rows[0];
    assert.ok(first);
    assert.equal(first.bidNumber, "2026-0130");
    assert.equal(first.title, "Concrete (Ready-Mix)");
    assert.equal(first.type, "ITB");
    assert.equal(first.openDate, "7/7/2026");
    assert.ok(first.closeDate?.startsWith("7/30/2026"));
  });

  it("returns empty array for an empty listing page", () => {
    const rows = parseIonWaveListingHtml(EMPTY_FIXTURE);
    assert.equal(rows.length, 0);
  });
});

describe("IonWave public bid listing adapter", () => {
  it("produces stable tenant-scoped IDs and buyer identity", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(ACTIVE_FIXTURE, { status: 200, headers: { "content-type": "text/html" } });
    try {
      const provider = new IonWavePortalProvider([BLOUNT_TENANT]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(result.errors.length, 0);
      assert.equal(result.records.length, 3);

      const first = result.records[0];
      assert.ok(first);
      assert.equal(first.externalId, "ionwave-blounttn-962");
      assert.equal(first.agency, "Blount County");
      assert.equal(first.status, "active");
      assert.equal(first.solicitationNumber, "2026-0130");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("populates required technical-platform metadata", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(ACTIVE_FIXTURE, { status: 200, headers: { "content-type": "text/html" } });
    try {
      const provider = new IonWavePortalProvider([BLOUNT_TENANT]);
      const result = await provider.fetch({ limit: 10 });
      const record = result.records[0];
      assert.ok(record);
      assert.equal(record.rawData?.providerPlatform, "ionwave_euna");
      assert.equal(record.rawData?.tenantSlugOrId, "blounttn");
      assert.equal(record.rawData?.sourceId, "tn-blount-county");
      assert.equal(record.rawData?.nativeOpportunityId, "962");
      assert.ok(typeof record.rawData?.listingUrl === "string");
      assert.ok(typeof record.rawData?.collectedAt === "string");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("uses unknown-date convention when OpenDate is absent", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(UNKNOWN_DATE_FIXTURE, { status: 200, headers: { "content-type": "text/html" } });
    try {
      const provider = new IonWavePortalProvider([BLOUNT_TENANT]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(result.errors.length, 0);
      const record = result.records[0];
      assert.ok(record);
      assert.equal(record.postedDate.getTime(), 0, "Unknown posted date must be new Date(0)");
      assert.equal(record.rawData?.dateUnknown, true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns empty records for an empty listing without error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(EMPTY_FIXTURE, { status: 200, headers: { "content-type": "text/html" } });
    try {
      const provider = new IonWavePortalProvider([BLOUNT_TENANT]);
      const result = await provider.fetch({ limit: 10 });
      assert.equal(result.records.length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("removes duplicate opportunity IDs", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(ACTIVE_FIXTURE, { status: 200, headers: { "content-type": "text/html" } });
    try {
      // Two providers with the same BidIDs would try to insert duplicates
      const tenantA = { ...BLOUNT_TENANT };
      const tenantB = { ...BLOUNT_TENANT, portalId: "tn-blount-county-2", tenantId: "blounttn" };
      const provider = new IonWavePortalProvider([tenantA, tenantB]);
      const result = await provider.fetch({ limit: 20 });
      const ids = result.records.map((r) => r.externalId);
      const uniqueIds = new Set(ids);
      assert.equal(ids.length, uniqueIds.size, "No duplicate external IDs must appear");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("exposes empty documentUrls (IonWave documents require login)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(ACTIVE_FIXTURE, { status: 200, headers: { "content-type": "text/html" } });
    try {
      const provider = new IonWavePortalProvider([BLOUNT_TENANT]);
      const result = await provider.fetch({ limit: 10 });
      const record = result.records[0];
      assert.ok(Array.isArray(record?.rawData?.documentUrls));
      assert.equal((record?.rawData?.documentUrls as string[]).length, 0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
