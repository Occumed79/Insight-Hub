from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"Expected exactly one match in {path}, found {count}: {old[:160]!r}")
    file_path.write_text(text.replace(old, new, 1))


replace_once(
    "api-server/src/lib/config/providerConfig.ts",
    '  | "bidnet"\n  | "statePortals"',
    '  | "bidnet"\n  | "govBid"\n  | "statePortals"',
)

replace_once(
    "api-server/src/lib/config/providerConfig.ts",
    '''  bidnet: {
    ...provider("bidnet", "BidNet Direct", "procurement", "direct_source", [secretField("bidnetApiKey", "BIDNET_API_KEY")], ["State and local bids"], "partial"),
    optionalFields: [{ key: "baseUrl", label: "API Base URL", type: "url", placeholder: "BidNet API base URL", dbKey: "bidnetBaseUrl", envKey: "BIDNET_BASE_URL" }],
  },
  statePortals:''',
    '''  bidnet: {
    ...provider("bidnet", "BidNet Direct", "procurement", "direct_source", [secretField("bidnetApiKey", "BIDNET_API_KEY")], ["State and local bids"], "partial"),
    optionalFields: [{ key: "baseUrl", label: "API Base URL", type: "url", placeholder: "BidNet API base URL", dbKey: "bidnetBaseUrl", envKey: "BIDNET_BASE_URL" }],
  },
  govBid: {
    ...provider("govBid", "GovBid", "procurement", "direct_source", [], ["Authorized U.S. and Canadian tender aggregation", "Healthcare and medical opportunity discovery", "Original government source links", "Cross-source deduplication"], "live", "Authorized GovBid integration for open government tenders across the United States and Canada."),
    docsUrl: "https://govbid.ca/coverage",
    signupUrl: "https://govbid.ca/alerts",
    notes: "Automated access is enabled under permission confirmed by Occu-Med. Records preserve GovBid detail links and the original government notice URL when available.",
  },
  statePortals:''',
)

replace_once(
    "api-server/src/lib/providers/index.ts",
    'export * from "./bidnet";\nexport * from "./statePortals";',
    'export * from "./bidnet";\nexport * from "./govBid";\nexport * from "./statePortals";',
)
replace_once(
    "api-server/src/lib/providers/index.ts",
    'import { bidnetProvider } from "./bidnet";\nimport { statePortalsProvider } from "./statePortals";',
    'import { bidnetProvider } from "./bidnet";\nimport { govBidProvider } from "./govBid";\nimport { statePortalsProvider } from "./statePortals";',
)
replace_once(
    "api-server/src/lib/providers/index.ts",
    '  bidnet: bidnetProvider,\n  statePortals:',
    '  bidnet: bidnetProvider,\n  govBid: govBidProvider,\n  statePortals:',
)

replace_once(
    "api-server/src/lib/search/unifiedSearch.ts",
    'import { bidnetProvider } from "../providers/bidnet";\nimport { grantsGovProvider }',
    'import { bidnetProvider } from "../providers/bidnet";\nimport { govBidProvider } from "../providers/govBid";\nimport { grantsGovProvider }',
)
replace_once(
    "api-server/src/lib/search/unifiedSearch.ts",
    '  await runProvider("eunaBonfire", eunaBonfireProvider);\n  await runProvider("grantsGov", grantsGovProvider);',
    '  await runProvider("eunaBonfire", eunaBonfireProvider);\n  await runProvider("govBid", govBidProvider);\n  await runProvider("grantsGov", grantsGovProvider);',
)

replace_once(
    "api-server/src/lib/search/scheduler.ts",
    '["samGov", "grantsGov", "publicPortalProviders", "eunaBonfire", "serper", "tavily"]',
    '["samGov", "grantsGov", "publicPortalProviders", "eunaBonfire", "govBid", "serper", "tavily"]',
)

replace_once(
    "render.yaml",
    'value: samGov,grantsGov,publicPortalProviders,eunaBonfire,serper,tavily',
    'value: samGov,grantsGov,publicPortalProviders,eunaBonfire,govBid,serper,tavily',
)

replace_once(
    "intel-suite/src/pages/portal/opportunities.tsx",
    '  { key: "eunaBonfire", label: "Euna Supplier Network", desc: "Separate public Bonfire/Euna opportunity discovery", stub: false },\n  { key: "olostep"',
    '  { key: "eunaBonfire", label: "Euna Supplier Network", desc: "Separate public Bonfire/Euna opportunity discovery", stub: false },\n  { key: "govBid", label: "GovBid", desc: "Authorized U.S. + Canada tender feed", stub: false },\n  { key: "olostep"',
)
replace_once(
    "intel-suite/src/pages/portal/opportunities.tsx",
    'const [fetchProviders, setFetchProviders] = useState<string[]>(["sam_gov", "grantsGov", "usaSpending", "serper", "tavily", "publicPortalProviders", "eunaBonfire"]);',
    'const [fetchProviders, setFetchProviders] = useState<string[]>(["sam_gov", "grantsGov", "usaSpending", "serper", "tavily", "publicPortalProviders", "eunaBonfire", "govBid"]);',
)

print("GovBid changes applied on top of Euna-enabled main")
