import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import { georgiaGaworkProvider } from "../georgiaGawork";
import {
  hawaiiHandsProvider,
  parseHawaiiHandsJson,
} from "../hawaiiHands";
import {
  newHampshireBidsProvider,
} from "../newHampshireBids";
import { describeOfficialPortalRequestError } from "../officialPortalHttp";
import {
  minnesotaOspProvider,
  parseMinnesotaOspHtml,
} from "../minnesotaOsp";
import {
  oregonBuysProvider,
  parseOregonBuysListingHtml,
} from "../oregonBuys";
import { STATEWIDE_LIVE_TARGETS } from "../runStatewideLiveVerification";
import {
  parseSouthDakotaPostingBoardJson,
  southDakotaPostingBoardProvider,
} from "../southDakotaPostingBoard";

type JsonRecord = Record<string, unknown>;

function extractInitialResponse(html: string): JsonRecord {
  const marker = html.indexOf("moInitialResponse");
  if (marker < 0) throw new Error("CGI Advantage page did not expose moInitialResponse");
  const start = html.indexOf("{", marker);
  if (start < 0) throw new Error("CGI Advantage initial response JSON did not start");
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < html.length; index += 1) {
    const value = html[index] as string;
    if (quote) {
      if (escaped) escaped = false;
      else if (value === "\\") escaped = true;
      else if (value === quote) quote = "";
      continue;
    }
    if (value === '"' || value === "'") quote = value;
    else if (value === "{") depth += 1;
    else if (value === "}") {
      depth -= 1;
      if (depth === 0) return JSON.parse(html.slice(start, index + 1)) as JsonRecord;
    }
  }
  throw new Error("CGI Advantage initial response JSON was incomplete");
}

function findNavigation(value: unknown, matcher: RegExp): JsonRecord | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findNavigation(item, matcher);
      if (found) return found;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const record = value as JsonRecord;
  if (
    record.type === "nav"
    && matcher.test(`${String(record.title ?? "")} ${String(record.name ?? "")} ${String(record.key ?? "")}`)
  ) return record;
  for (const item of Object.values(record)) {
    const found = findNavigation(item, matcher);
    if (found) return found;
  }
  return undefined;
}

function navigationSummary(value: unknown): Array<Record<string, unknown>> {
  const results: Array<Record<string, unknown>> = [];
  const walk = (item: unknown): void => {
    if (Array.isArray(item)) {
      item.forEach(walk);
      return;
    }
    if (!item || typeof item !== "object") return;
    const record = item as JsonRecord;
    if (record.type === "nav") {
      results.push(Object.fromEntries(
        ["key", "name", "title", "actionType", "applicationUrl", "targetComponentType", "targetLocation", "targetQualifiedName", "targetPage", "viewName"]
          .map((key) => [key, record[key]])
          .filter(([, value]) => value !== undefined),
      ));
    }
    Object.values(record).forEach(walk);
  };
  walk(value);
  return results;
}

function cookieHeader(headers: Headers, prior = ""): string {
  const existing = new Map<string, string>();
  for (const pair of prior.split(/;\s*/).filter(Boolean)) {
    const separator = pair.indexOf("=");
    if (separator > 0) existing.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  const extended = headers as Headers & { getSetCookie?: () => string[] };
  const values = extended.getSetCookie?.() ?? (headers.get("set-cookie") ? [headers.get("set-cookie") as string] : []);
  for (const value of values) {
    const pair = value.split(";", 1)[0] ?? "";
    const separator = pair.indexOf("=");
    if (separator > 0) existing.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return Array.from(existing.entries()).map(([name, value]) => `${name}=${value}`).join("; ");
}

function pageOpenPayload(state: JsonRecord, navigation: JsonRecord): JsonRecord {
  const sessionInfo = state.session_info as JsonRecord;
  return {
    action: {
      key: navigation.key,
      name: navigation.name,
      actionType: "pageOpen",
      params: {
        targetLocation: navigation.targetLocation,
        targetComponentType: navigation.targetComponentType,
        isEntpriseSrchCreateAction: Boolean(navigation.isEntpriseSrchCreateAction),
      },
      targetQualifiedName: navigation.targetQualifiedName,
      ...(navigation.targetPage ? { targetPage: navigation.targetPage } : {}),
      ...(navigation.viewName ? { viewName: navigation.viewName } : {}),
      isCarouselNavigation: Boolean(navigation.isCarouselNavigation),
      suppressLeafing: Boolean(navigation.suppressLeafing),
    },
    session_info: sessionInfo,
    ...(state.data ? { data: state.data } : {}),
    ...(state.viewState ? { viewState: state.viewState } : {}),
    ...(state.checksum ? { checksum: state.checksum } : {}),
  };
}

async function postPageOpen(
  state: JsonRecord,
  navigation: JsonRecord,
  cookie: string,
  referer: string,
): Promise<{ response: Response; body: string; cookie: string }> {
  const applicationUrl = String(navigation.applicationUrl ?? "");
  const sessionInfo = state.session_info as JsonRecord;
  const response = await fetch(applicationUrl, {
    method: "POST",
    redirect: "manual",
    headers: {
      accept: "application/json,text/plain,*/*",
      "content-type": "application/json",
      origin: new URL(applicationUrl).origin,
      referer,
      cookie,
      "adv-page-id": String(sessionInfo.page_id ?? ""),
      "adv-action-type": "pageOpen",
      "user-agent": "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)",
    },
    body: JSON.stringify(pageOpenPayload(state, navigation)),
  });
  const body = await response.text();
  return { response, body, cookie: cookieHeader(response.headers, cookie) };
}

describe("blocked-state deep recovery providers", () => {
  it("parses Minnesota's official labeled solicitation bulletin", () => {
    const html = `<main>
      <div>REFERENCE NUMBER: 37413</div>
      <div>Purchasing Agency: Natural Resources Department</div>
      <div>Solicitation Number: 2000018497</div>
      <div>Title: DNR RFB Kawishiwi Falls Parking Lot</div>
      <div>Response to this solicitation is due no later than: 07/28/2099 at 2:00pm</div>
      <div>Description of Work: Bituminous parking lot improvements.</div>
      <div>Date This Solicitation Was Posted: 07/17/2099 at 4:10pm</div>
      <div>Category Codes: 72103301, 72141003</div>
    </main>`;
    const rows = parseMinnesotaOspHtml(html);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.referenceNumber, "37413");
    assert.equal(rows[0]!.solicitationNumber, "2000018497");
    assert.equal(rows[0]!.agency, "Natural Resources Department");
    assert.equal(rows[0]!.title, "DNR RFB Kawishiwi Falls Parking Lot");
    assert.deepEqual(rows[0]!.categoryCodes, ["72103301", "72141003"]);
    assert.equal(rows[0]!.responseDeadline?.getFullYear(), 2099);
  });

  it("parses Hawaii's first-party HANDS search response", () => {
    const rows = parseHawaiiHandsJson(JSON.stringify({ data: { searchResult: { content: [{
      id: 91827,
      solicitionNo: "RFP-26-001",
      title: "Statewide Occupational Health Services",
      category: "Health and Human Services",
      jurisdiction: "Executive Branch",
      department: "Department of Human Services",
      island: "Statewide",
      publishDate: "07/15/2026",
      dueDate: "08/31/2099 2:00 PM",
      status: "POSTED",
      system: "HANDS",
    }] } } }));
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.id, 91827);
    assert.equal(rows[0]!.solicitionNo, "RFP-26-001");
  });

  it("parses OregonBuys BSO open-bid rows and preserves official detail URLs", () => {
    const html = `<table><tr>
      <td><a href="/bso/external/bidDetail.sda?docId=S-73000-00017535&amp;external=true&amp;parentUrl=close">S-73000-00017535</a></td>
      <td>Department of Transportation</td><td>Terri Buyer</td><td>Grinding and Paving Services</td>
      <td>12/31/2099 2:00 PM</td><td>Sent</td>
    </tr></table>`;
    const rows = parseOregonBuysListingHtml(html);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.bidNumber, "S-73000-00017535");
    assert.equal(rows[0]!.organization, "Department of Transportation");
  });

  it("parses South Dakota's first-party posting-board API payload", () => {
    const events = parseSouthDakotaPostingBoardJson(JSON.stringify({ data: [{
      eventId: 19839,
      eventName: "Statewide Medical Services RFP",
      publishedDate: "2026-07-15T12:00:00Z",
      eventDueDate: "2099-08-01T20:00:00Z",
      invitationType: { description: "Request for Proposal" },
      status: { description: "Open" },
    }] }));
    assert.equal(events.length, 1);
    assert.equal(events[0]!.eventId, 19839);
  });

  it("uses the dedicated recovery providers in the 50-state verifier", () => {
    assert.equal(STATEWIDE_LIVE_TARGETS.find((target) => target.state === "GA")?.provider, georgiaGaworkProvider);
    assert.equal(STATEWIDE_LIVE_TARGETS.find((target) => target.state === "HI")?.provider, hawaiiHandsProvider);
    assert.equal(STATEWIDE_LIVE_TARGETS.find((target) => target.state === "MN")?.provider, minnesotaOspProvider);
    assert.equal(STATEWIDE_LIVE_TARGETS.find((target) => target.state === "NH")?.provider, newHampshireBidsProvider);
    assert.equal(STATEWIDE_LIVE_TARGETS.find((target) => target.state === "OR")?.provider, oregonBuysProvider);
    assert.equal(STATEWIDE_LIVE_TARGETS.find((target) => target.state === "SD")?.provider, southDakotaPostingBoardProvider);
  });

  it("reports the underlying network cause instead of generic fetch failed", () => {
    const error = new Error("fetch failed") as Error & { cause?: unknown };
    error.cause = { code: "ENOTFOUND", syscall: "getaddrinfo", hostname: "oregonbuys.gov" };
    assert.equal(
      describeOfficialPortalRequestError(error, "OregonBuys open bids", 30_000),
      "OregonBuys open bids network request failed (code=ENOTFOUND, syscall=getaddrinfo, hostname=oregonbuys.gov): fetch failed",
    );
  });

  it("executes the official CGI Advantage public guest carousel flow", async () => {
    const targets = {
      KY: "https://vss.ky.gov/vssprod-ext/Advantage4",
      MI: "https://sigma.michigan.gov/PRDVSS1X1/Advantage4",
    };
    const root = resolve(process.env.GITHUB_WORKSPACE ?? process.cwd(), "artifacts/statewide-live-verification/cgi-guest-flow");
    await mkdir(root, { recursive: true });

    for (const [state, initialUrl] of Object.entries(targets)) {
      const initialResponse = await fetch(initialUrl, {
        redirect: "follow",
        headers: { "user-agent": "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)" },
      });
      const initialHtml = await initialResponse.text();
      const initialState = extractInitialResponse(initialHtml);
      const carousel = findNavigation(initialState, /carousalAction|what would you like to do/i);
      if (!carousel) throw new Error(`${state}: public carousel action was not present`);
      let cookie = cookieHeader(initialResponse.headers);
      const first = await postPageOpen(initialState, carousel, cookie, initialResponse.url || initialUrl);
      cookie = first.cookie;
      await writeFile(resolve(root, `${state}-01-carousel-response.txt`), first.body, "utf8");
      let firstJson: JsonRecord | undefined;
      try { firstJson = JSON.parse(first.body) as JsonRecord; } catch { firstJson = undefined; }
      const firstNavs = navigationSummary(firstJson);
      console.log(`CGI_GUEST_FLOW ${state} CAROUSEL HTTP ${first.response.status} NAVS ${JSON.stringify(firstNavs)}`);

      const business = findNavigation(firstJson, /business opportun|solicitation|bid opportun/i);
      if (business && firstJson) {
        const second = await postPageOpen(firstJson, business, cookie, String(business.applicationUrl ?? initialUrl));
        await writeFile(resolve(root, `${state}-02-business-response.txt`), second.body, "utf8");
        let secondJson: JsonRecord | undefined;
        try { secondJson = JSON.parse(second.body) as JsonRecord; } catch { secondJson = undefined; }
        console.log(`CGI_GUEST_FLOW ${state} BUSINESS HTTP ${second.response.status} NAVS ${JSON.stringify(navigationSummary(secondJson))}`);
      } else {
        console.log(`CGI_GUEST_FLOW ${state} BUSINESS_NAV_NOT_FOUND`);
      }
    }
  });
});
