import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSamGovAutonomousTitleQueries,
  buildSamGovTitleQueries,
  isBidReadySamOpportunity,
} from "../samGovQuality";

const now = new Date("2026-07-29T19:00:00.000Z");
const openSolicitation = {
  noticeId: "notice-1",
  title: "Occupational Health Services",
  type: "Solicitation",
  active: "Yes",
  postedDate: "2026-07-20",
  responseDeadLine: "2026-08-30T23:59:00.000Z",
};

describe("SAM.gov bid-ready query policy", () => {
  it("maps natural procurement wording to supported high-intent title queries", () => {
    assert.deepEqual(
      buildSamGovTitleQueries(
        "occupational health services city county RFP due soon",
      ),
      ["occupational health"],
    );
    assert.deepEqual(
      buildSamGovTitleQueries("drug testing and DOT physical solicitation"),
      ["drug testing", "medical examination"],
    );
  });

  it("reserves blank input for the rotating autonomous service portfolio", () => {
    assert.deepEqual(buildSamGovTitleQueries(), []);
    assert.deepEqual(buildSamGovAutonomousTitleQueries(0, 2), [
      "occupational health",
      "occupational medicine",
    ]);
    assert.deepEqual(buildSamGovAutonomousTitleQueries(6, 3), [
      "respiratory protection",
      "hearing conservation",
      "occupational health",
    ]);
  });

  it("accepts only active bid notices with a future response deadline", () => {
    assert.equal(isBidReadySamOpportunity(openSolicitation, now), true);
    assert.equal(
      isBidReadySamOpportunity(
        { ...openSolicitation, responseDeadLine: "2026-07-01" },
        now,
      ),
      false,
    );
    assert.equal(
      isBidReadySamOpportunity(
        { ...openSolicitation, type: "Sources Sought" },
        now,
      ),
      false,
    );
    assert.equal(
      isBidReadySamOpportunity(
        {
          ...openSolicitation,
          type: "Award Notice",
          award: { amount: 125000 },
        },
        now,
      ),
      false,
    );
  });

  it("uses targeted SAM requests and hydrates thin SAM metadata before semantic review", async () => {
    const originalFetch = globalThis.fetch;
    const originalSamKey = process.env.SAM_GOV_API_KEY;
    const originalSamBase = process.env.SAM_GOV_BASE_URL;
    const originalJinaKey = process.env.JINA_API_KEY;
    const samRequests: string[] = [];
    const jinaRequests: string[] = [];

    process.env.SAM_GOV_API_KEY = "test-sam-key";
    process.env.SAM_GOV_BASE_URL = "https://api.sam.gov/opportunities/v2/search";
    process.env.JINA_API_KEY = "test-jina-key";

    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url.startsWith("https://api.sam.gov/opportunities/v2/search")) {
        samRequests.push(url);
        return new Response(
          JSON.stringify({
            opportunitiesData: [
              {
                noticeId: "hydration-notice",
                solicitationNumber: "TEST-26-001",
                title: "Testing Services",
                fullParentPathName: "DEPARTMENT OF TESTING.TEST OFFICE",
                type: "Solicitation",
                baseType: "Solicitation",
                active: "Yes",
                naicsCode: "621999",
                classificationCode: "Q999",
                postedDate: "2026-08-18",
                responseDeadLine: "2099-09-30T23:59:00.000Z",
                description: "https://api.sam.gov/prod/opps/v3/opportunities/resources/files/test",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.startsWith("https://r.jina.ai/")) {
        jinaRequests.push(url);
        return new Response(
          "Official SAM.gov solicitation for employee occupational medical examinations, medical surveillance, audiometry, spirometry, drug testing, and fitness-for-duty services for a federal workforce. Proposals are currently being accepted.",
          { status: 200, headers: { "content-type": "text/plain" } },
        );
      }
      throw new Error(`Unexpected fetch in SAM regression: ${url}`);
    };

    try {
      const { SamGovProvider } = await import("../samGov");
      const result = await new SamGovProvider().fetch({ dateRange: 30, limit: 1000 });

      assert.equal(samRequests.length, 2);
      for (const request of samRequests) {
        const params = new URL(request).searchParams;
        assert.ok(params.get("title"));
        assert.deepEqual(params.getAll("ptype"), ["o", "k"]);
        assert.equal(params.get("limit"), "250");
      }
      assert.equal(jinaRequests.length, 1);
      assert.equal(result.records.length, 1);
      assert.match(result.records[0]!.description ?? "", /occupational medical examinations/i);
      assert.equal(result.records[0]!.rawData?.descriptionHydratedBy, "jina-reader");
      assert.equal(result.errors.length, 0);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalSamKey === undefined) delete process.env.SAM_GOV_API_KEY;
      else process.env.SAM_GOV_API_KEY = originalSamKey;
      if (originalSamBase === undefined) delete process.env.SAM_GOV_BASE_URL;
      else process.env.SAM_GOV_BASE_URL = originalSamBase;
      if (originalJinaKey === undefined) delete process.env.JINA_API_KEY;
      else process.env.JINA_API_KEY = originalJinaKey;
    }
  });
});
