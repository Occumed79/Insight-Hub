import assert from "node:assert/strict";
import test from "node:test";

import {
  BIDLOCKER_COLLECTIBLE_PORTAL_IDS,
  BIDLOCKER_TENANTS,
  BidLockerPortalProvider,
  parseBidLockerDetailHtml,
  parseBidLockerListingHtml,
} from "../bidLockerPortal";

const clackamas = BIDLOCKER_TENANTS.find(
  (tenant) => tenant.portalId === "or-clackamas-county",
);

assert.ok(clackamas);

test("BidLocker listing parser isolates the buyer and deduplicates detail links", () => {
  const html = `
    <section>
      <a href="/a/clackamascounty/details/6276_2026_48_Rfp_Disaster_Debris_Clearance_Removal">
        2026-48 RFP Disaster Debris Clearance &amp; Removal
      </a>
      <a href="/a/clackamascounty/details/6276_2026_48_Rfp_Disaster_Debris_Clearance_Removal">View details</a>
      <a href="/a/deschutescounty/details/6298_Other_Buyer">Other Buyer RFP</a>
    </section>
  `;

  const items = parseBidLockerListingHtml(html, clackamas);
  assert.deepEqual(items, [
    {
      nativeId: "6276",
      title: "2026-48 RFP Disaster Debris Clearance & Removal",
      detailUrl:
        "https://bidlocker.us/a/clackamascounty/details/6276_2026_48_Rfp_Disaster_Debris_Clearance_Removal",
    },
  ]);
});

test("BidLocker detail parser extracts normalized project metadata", () => {
  const detailUrl =
    "https://bidlocker.us/a/clackamascounty/details/6276_2026_48_Rfp_Disaster_Debris_Clearance_Removal";
  const html = `
    <main>
      <h1>2026-48 RFP Disaster Debris Clearance &amp; Removal</h1>
      <div>Project #: 2026-48</div>
      <div>Issued by: Clackamas County</div>
      <div>Publish Date: Jul 7, 2026 6:22PM</div>
      <div>Proposals Due Date: Jul 28, 2026 4:00PM (Pacific Daylight Time)</div>
      <div>Status: Open</div>
      <h2>Description</h2>
      <p>Clackamas County is seeking disaster debris clearance and removal services.</p>
      <h2>Attachments</h2>
    </main>
  `;

  const detail = parseBidLockerDetailHtml(html, clackamas, detailUrl);
  assert.ok(detail);
  assert.equal(detail.nativeId, "6276");
  assert.equal(detail.projectNumber, "2026-48");
  assert.equal(detail.status, "active");
  assert.equal(detail.postedDate?.toISOString(), "2026-07-08T01:22:00.000Z");
  assert.equal(
    detail.responseDeadline?.toISOString(),
    "2026-07-28T23:00:00.000Z",
  );
  assert.equal(
    detail.description,
    "Clackamas County is seeking disaster debris clearance and removal services.",
  );
});

test("BidLocker tenant set exposes one shared provider for three Oregon buyers", async () => {
  assert.deepEqual(
    [...BIDLOCKER_COLLECTIBLE_PORTAL_IDS].sort(),
    ["or-clackamas-county", "or-deschutes-county", "or-lane-county"],
  );
  const provider = new BidLockerPortalProvider(BIDLOCKER_TENANTS);
  assert.equal(await provider.isConfigured(), true);
});
