import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  statewideContentHasExplicitEmptyEvidence,
  statewideContentLooksLikeBrowserShell,
} from "../statewideProcurementContentSignals";
import {
  STATEWIDE_PORTAL_CONFIGS,
  StatewideProcurementProvider,
} from "../statewideProcurementPortals";

function config(portalId: string) {
  const found = STATEWIDE_PORTAL_CONFIGS.find((item) => item.portalId === portalId);
  assert.ok(found, `missing config ${portalId}`);
  return found;
}

const PA = config("pa-emarketplace");

describe("statewide empty-state evidence", () => {
  it("accepts explicit no-results text", () => {
    assert.equal(statewideContentHasExplicitEmptyEvidence("<div>No current solicitations were found.</div>"), true);
  });

  it("accepts an empty structured collection", () => {
    assert.equal(statewideContentHasExplicitEmptyEvidence('{"results":[]}'), true);
  });

  it("accepts a listing table whose data rows are all closed", () => {
    const html = `<table><tr><th>Solicitation</th><th>Status</th></tr><tr><td>PA-1</td><td>Closed</td></tr></table>`;
    assert.equal(statewideContentHasExplicitEmptyEvidence(html), true);
  });

  it("detects a JavaScript-only application shell", () => {
    const html = `<html><body><div id="root"></div><script src="/assets/app.bundle.js"></script></body></html>`;
    assert.equal(statewideContentLooksLikeBrowserShell(html), true);
  });

  it("detects the Florida Angular root shell", () => {
    const html = `<mfmp-root></mfmp-root><script src="runtime.1.js"></script><script src="main.2.js"></script>`;
    assert.equal(statewideContentLooksLikeBrowserShell(html), true);
  });

  it("detects a PrimeFaces search gated by AJAX ViewState and reCAPTCHA", () => {
    const html = `<form id="bidSearchForm"><script>PrimeFaces.ab({s:'search'});</script><script src="https://www.google.com/recaptcha/api.js"></script></form>`;
    assert.equal(statewideContentLooksLikeBrowserShell(html), true);
  });

  it("detects the CGI Advantage guest-access transition", () => {
    const html = `<form method="post"><input name="guest_login" value="Public Access" type="submit"></form>`;
    assert.equal(statewideContentLooksLikeBrowserShell(html), true);
  });

  it("detects the CGI Advantage 4 client application shell", () => {
    const html = `<html><head><script>var moInitialResponse = {"page_metadata":{"key":"vss.page.VAXXX03150"}};</script></head><body><div id="viewManager"></div></body></html>`;
    assert.equal(statewideContentLooksLikeBrowserShell(html), true);
  });

  it("detects a Perfdrive hCaptcha block", () => {
    const html = `<img src="https://captcha.perfdrive.com/captcha-public/images/ss_captcha.png"><p>Your activity made us think that you are a bot.</p><div class="h-captcha"></div>`;
    assert.equal(statewideContentLooksLikeBrowserShell(html), true);
  });

  it("detects a Telerik grid requiring browser InitialPageLoad", () => {
    const html = `<script>RadAjaxManager; manager.ajaxRequest("InitialPageLoad");</script>`;
    assert.equal(statewideContentLooksLikeBrowserShell(html), true);
  });

  it("reports fetched but unrecognized non-empty markup as a parser failure", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("<html><body><main>Procurement portal landing content</main></body></html>", { status: 200 });
    try {
      const provider = new StatewideProcurementProvider(PA);
      const result = await provider.fetch({ limit: 1 });
      assert.equal(result.records.length, 0);
      assert.ok(result.errors.some((error) => error.includes("no parseable active opportunity rows")));
      assert.equal((await provider.getStatus()).healthy, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
