import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PublicPortalSession,
  STATEWIDE_PORTAL_CONFIGS,
  StatewideProcurementProvider,
} from "../statewideProcurementPortals";

function config(portalId: string) {
  const found = STATEWIDE_PORTAL_CONFIGS.find((item) => item.portalId === portalId);
  assert.ok(found, `missing config ${portalId}`);
  return found;
}

const CT = config("ct-ctsource");
const PA = config("pa-emarketplace");

describe("statewide portal hotfixes", () => {
  it("does not replay cookies across configured official origins", async () => {
    const originalFetch = globalThis.fetch;
    const observedCookies: Array<string | null> = [];
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      observedCookies.push(new Headers(init?.headers).get("cookie"));
      if (url.startsWith("https://portal.ct.gov/")) {
        return new Response("", {
          status: 302,
          headers: {
            location: "https://webprocure.proactiscloud.com/wp-web-public/#/bidboard",
            "set-cookie": "ctsession=secret; Path=/; Secure; HttpOnly",
          },
        });
      }
      return new Response("<html><body>Bid board</body></html>", { status: 200 });
    };
    try {
      const session = new PublicPortalSession(CT);
      await session.fetchText(CT.listingUrl, 3_000, 0, "CT listing");
      assert.deepEqual(observedCookies, [null, null]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("treats a reachable portal with no active opportunities as healthy empty", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(`
      <table>
        <tr><th>Solicitation Number</th><th>Title</th><th>Status</th></tr>
        <tr><td>PA-CLOSED-1</td><td><a href="/SolicitationDetails.aspx?SID=PA-CLOSED-1">Closed medical services</a></td><td>Closed</td></tr>
      </table>
    `, { status: 200 });
    try {
      const provider = new StatewideProcurementProvider(PA);
      const result = await provider.fetch({ limit: 2 });
      const status = await provider.getStatus();
      assert.deepEqual(result, { records: [], total: 0, errors: [] });
      assert.equal(status.healthy, true);
      assert.equal(status.recordCount, 0);
      assert.ok(status.lastSuccess);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
