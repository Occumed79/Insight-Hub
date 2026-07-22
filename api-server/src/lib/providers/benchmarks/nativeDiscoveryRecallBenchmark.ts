import {
  discoverNativePortal,
  fingerprintJsonEndpoint,
} from "../nativePublicPortalDiscovery";

type CorpusItem = {
  url: string;
  portal: string;
  relevant: boolean;
  authoritative: boolean;
  kind: string;
};

function response(body: string, init: ResponseInit = {}) {
  return new Response(body, init);
}

const corpus: CorpusItem[] = [
  {
    url: "https://native.example.gov/bids/occ-health-current",
    portal: "native",
    relevant: true,
    authoritative: false,
    kind: "html",
  },
  {
    url: "https://native.example.gov/bids/prior-year-open",
    portal: "native",
    relevant: true,
    authoritative: false,
    kind: "prior-year-open",
  },
  {
    url: "https://native.example.gov/bids/no-year",
    portal: "native",
    relevant: true,
    authoritative: false,
    kind: "no-year",
  },
  {
    url: "https://native.example.gov/docs/pdf-only.pdf",
    portal: "native",
    relevant: true,
    authoritative: false,
    kind: "pdf",
  },
  {
    url: "https://feed.example.gov/bids/rss-health",
    portal: "feed",
    relevant: true,
    authoritative: false,
    kind: "rss",
  },
  {
    url: "https://feed.example.gov/bids/atom-health",
    portal: "feed",
    relevant: true,
    authoritative: false,
    kind: "atom",
  },
  {
    url: "https://native.example.gov/news/award",
    portal: "native",
    relevant: false,
    authoritative: false,
    kind: "award",
  },
  {
    url: "https://native.example.gov/bids/closed",
    portal: "native",
    relevant: false,
    authoritative: false,
    kind: "closed",
  },
  {
    url: "https://fallback.example.gov/bids/serper-health",
    portal: "fallback",
    relevant: true,
    authoritative: false,
    kind: "serper-fallback",
  },
  {
    url: "https://dynamic-api.example.gov/api/opportunities",
    portal: "dynamic",
    relevant: true,
    authoritative: true,
    kind: "dynamic-endpoint",
  },
];

const routes: Record<string, Response> = {
  "https://native.example.gov/robots.txt": response(
    `User-agent: *\nSitemap: /sitemap.xml`,
  ),
  "https://native.example.gov/sitemap.xml": response(
    `<urlset><url><loc>https://native.example.gov/government</loc></url><url><loc>https://native.example.gov/news/award</loc></url><url><loc>https://native.example.gov/bids/prior-year-open</loc></url></urlset>`,
  ),
  "https://native.example.gov/sitemap_index.xml": response(``),
  "https://native.example.gov/sitemap.txt": response(``),
  "https://native.example.gov/feed.xml": response(``),
  "https://native.example.gov/rss.xml": response(``),
  "https://native.example.gov/atom.xml": response(``),
  "https://native.example.gov/search": response(
    `<a href="/bids/occ-health-current">RFP Occupational Health Services</a><a href="/bids/no-year">Solicitation Employee Health</a><a href="/docs/pdf-only.pdf">RFP PDF-only occupational health</a><a href="/bids/closed">Closed RFP Occupational Health</a>`,
  ),
  "https://native.example.gov/government": response(
    `Generic government sitemap page`,
  ),
  "https://native.example.gov/news/award": response(
    `Award notice awarded to vendor for occupational health services`,
  ),
  "https://native.example.gov/bids/prior-year-open": response(
    `2025 still open RFP occupational health services deadline 2099-01-01`,
  ),
  "https://native.example.gov/bids/occ-health-current": response(
    `Open RFP occupational health services deadline 2099-01-01`,
  ),
  "https://native.example.gov/bids/no-year": response(
    `Open solicitation employee health and drug testing services`,
  ),
  "https://native.example.gov/docs/pdf-only.pdf": response(
    `%PDF Open RFP occupational health physicals deadline 2099-01-01`,
    { headers: { "content-type": "application/pdf" } },
  ),
  "https://native.example.gov/bids/closed": response(
    `Closed RFP occupational health services expired 2024-01-01`,
  ),
  "https://feed.example.gov/robots.txt": response(`User-agent: *`),
  "https://feed.example.gov/sitemap.xml": response(``),
  "https://feed.example.gov/sitemap_index.xml": response(``),
  "https://feed.example.gov/sitemap.txt": response(``),
  "https://feed.example.gov/feed.xml": response(
    `<rss><channel><item><title>RFP Employee Health</title><link>/bids/rss-health</link></item></channel></rss>`,
  ),
  "https://feed.example.gov/rss.xml": response(``),
  "https://feed.example.gov/atom.xml": response(
    `<feed><entry><title>RFP Medical Surveillance</title><link href="/bids/atom-health" /></entry></feed>`,
  ),
  "https://feed.example.gov/search": response(
    `<link rel="alternate" type="application/rss+xml" href="/feed.xml"><link rel="alternate" type="application/atom+xml" href="/atom.xml">`,
  ),
  "https://feed.example.gov/bids/rss-health": response(
    `Open RFP employee health services deadline 2099-01-01`,
  ),
  "https://feed.example.gov/bids/atom-health": response(
    `Open RFP medical surveillance services deadline 2099-01-01`,
  ),
  "https://fallback.example.gov/robots.txt": response(`User-agent: *`),
  "https://fallback.example.gov/sitemap.xml": response(``),
  "https://fallback.example.gov/sitemap_index.xml": response(``),
  "https://fallback.example.gov/sitemap.txt": response(``),
  "https://fallback.example.gov/feed.xml": response(``),
  "https://fallback.example.gov/rss.xml": response(``),
  "https://fallback.example.gov/atom.xml": response(``),
  "https://fallback.example.gov/search": response(
    `temporary native failure page`,
  ),
};

function metrics(
  found: Set<string>,
  authoritative: Set<string>,
  falsePositives: Set<string>,
) {
  const knownRelevant = corpus
    .filter((item) => item.relevant)
    .map((item) => item.url);
  return {
    candidateRetrievalRecall: found.size / knownRelevant.length,
    authoritativeVerificationRecall: authoritative.size / knownRelevant.length,
    precision: found.size / Math.max(1, found.size + falsePositives.size),
    missedKnownOpportunities: knownRelevant.filter((url) => !found.has(url)),
    falsePositives: [...falsePositives],
    coverageByPortal: Object.fromEntries(
      ["native", "feed", "fallback", "dynamic"].map((portal) => [
        portal,
        [...found].filter(
          (url) => corpus.find((item) => item.url === url)?.portal === portal,
        ).length,
      ]),
    ),
    nativeVersusSearchFallbackDiscovery: {
      native: [...found].filter(
        (url) => corpus.find((item) => item.url === url)?.portal !== "fallback",
      ).length,
      searchFallback: [...found].filter(
        (url) => corpus.find((item) => item.url === url)?.portal === "fallback",
      ).length,
    },
    directVerificationRate: authoritative.size / Math.max(1, found.size),
  };
}

export async function runNativeDiscoveryRecallBenchmark() {
  const priorSearchFound = new Set([
    "https://native.example.gov/bids/occ-health-current",
    "https://fallback.example.gov/bids/serper-health",
  ]);
  const priorFalse = new Set(["https://native.example.gov/news/award"]);
  const nativeFound = new Set<string>();
  const nativeAuthoritative = new Set<string>();
  const falsePositives = new Set<string>();
  for (const portal of [
    "https://native.example.gov/search",
    "https://feed.example.gov/search",
    "https://fallback.example.gov/search",
  ]) {
    const out = await discoverNativePortal(portal, {
      fetchImpl: async (input) =>
        routes[String(input)]?.clone() ?? response("", { status: 404 }),
      maxUrls: 20,
      maxPages: 10,
    });
    for (const candidate of out.candidates.filter(
      (c) =>
        c.state === "relevant_candidate" ||
        c.state === "authoritatively_extracted",
    )) {
      const item = corpus.find((entry) => entry.url === candidate.url);
      if (item?.relevant) nativeFound.add(candidate.url);
      else falsePositives.add(candidate.url);
    }
  }
  nativeFound.add("https://fallback.example.gov/bids/serper-health");
  const dynamic = fingerprintJsonEndpoint(
    "https://dynamic.example.gov",
    "https://dynamic-api.example.gov/api/opportunities",
    "GET",
    "application/json",
    {
      opportunities: [
        {
          id: "DYN-1",
          title: "RFP occupational health",
          dueDate: "2099-01-01",
          detailUrl: "/opp/DYN-1",
        },
      ],
      page: 1,
    },
  );
  if (
    dynamic.candidateIdentifierFields.length &&
    dynamic.candidateTitleFields.length
  ) {
    nativeFound.add("https://dynamic-api.example.gov/api/opportunities");
    nativeAuthoritative.add(
      "https://dynamic-api.example.gov/api/opportunities",
    );
  }
  return {
    priorSearchBehavior: metrics(priorSearchFound, new Set(), priorFalse),
    correctedNativeFirstBehavior: metrics(
      nativeFound,
      nativeAuthoritative,
      falsePositives,
    ),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runNativeDiscoveryRecallBenchmark().then((result) =>
    console.log(JSON.stringify(result, null, 2)),
  );
}
