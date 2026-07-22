import { discoverNativePortal } from "../nativePublicPortalDiscovery";

function response(body: string, init: ResponseInit = {}) {
  return new Response(body, init);
}
const known = new Set([
  "https://portal.example.gov/bids/occ-health-1",
  "https://portal.example.gov/bids/medical-surveillance-2",
  "https://portal.example.gov/bids/drug-testing-3",
  "https://portal.example.gov/bids/pdf-only-4.pdf",
]);
const falsePositive = "https://portal.example.gov/news/award-5";
const routes: Record<string, Response> = {
  "https://portal.example.gov/robots.txt": response(
    `User-agent: *\nSitemap: /sitemap.xml`,
  ),
  "https://portal.example.gov/sitemap.xml": response(
    `<urlset><url><loc>${[...known][0]}</loc></url><url><loc>${falsePositive}</loc></url></urlset>`,
  ),
  "https://portal.example.gov/sitemap_index.xml": response(``),
  "https://portal.example.gov/sitemap.txt": response(``),
  "https://portal.example.gov/search": response(
    `<a href="/bids/medical-surveillance-2">RFP Medical Surveillance</a><a href="/page2">Next</a>`,
  ),
  "https://portal.example.gov/page2": response(
    `<a href="/bids/drug-testing-3">Solicitation Drug Testing</a><a href="/bids/pdf-only-4.pdf">RFP PDF only occupational health</a>`,
  ),
  "https://portal.example.gov/bids/occ-health-1": response(
    `Open RFP occupational health services deadline 2099-01-01`,
  ),
  "https://portal.example.gov/bids/medical-surveillance-2": response(
    `Open RFP medical surveillance deadline 2099-01-01`,
  ),
  "https://portal.example.gov/bids/drug-testing-3": response(
    `Open Solicitation drug testing deadline 2099-01-01`,
  ),
  "https://portal.example.gov/bids/pdf-only-4.pdf": response(
    `%PDF occupational health RFP`,
    { headers: { "content-type": "application/pdf" } },
  ),
  "https://portal.example.gov/news/award-5": response(
    `Award notice not biddable`,
  ),
};

export async function runNativeDiscoveryRecallBenchmark() {
  const before = {
    found: new Set([[...known][0]]),
    falsePositives: new Set([falsePositive]),
    native: 0,
    search: 1,
    verified: 0,
  };
  const native = await discoverNativePortal(
    "https://portal.example.gov/search",
    { fetchImpl: async (input) => routes[String(input)].clone(), maxPages: 8 },
  );
  const foundUrls = new Set(
    native.candidates.map((c) => c.url).filter((url) => known.has(url)),
  );
  const falsePositives = new Set(
    native.candidates.map((c) => c.url).filter((url) => !known.has(url)),
  );
  const after = {
    found: foundUrls,
    falsePositives,
    native: native.candidates.length,
    search: 0,
    verified: native.diagnostics.candidatesVerifiedFromDirectOfficialContent,
  };
  const metrics = (m: typeof before) => ({
    recall: m.found.size / known.size,
    precision: m.found.size / Math.max(1, m.found.size + m.falsePositives.size),
    missedKnownOpportunities: [...known].filter((url) => !m.found.has(url)),
    falsePositives: [...m.falsePositives],
    coverageByPortal: { "portal.example.gov": m.found.size },
    coverageByQueryBundle: { occupational_health: m.found.size },
    nativeVersusSearchFallbackDiscovery: {
      native: m.native,
      searchFallback: m.search,
    },
    directVerificationRate: m.verified / Math.max(1, m.native),
  });
  return { before: metrics(before), after: metrics(after) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runNativeDiscoveryRecallBenchmark().then((result) =>
    console.log(JSON.stringify(result, null, 2)),
  );
}
