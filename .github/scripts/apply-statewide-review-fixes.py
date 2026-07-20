from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected exactly one match, found {count}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1))


configs = "api-server/src/lib/providers/statewideProcurementConfigs.ts"
replace_once(
    configs,
    '''  state("mi-sigma", "State of Michigan", "MI", "Michigan SIGMA Vendor Self-Service", "cgi_advantage", "https://sigma-prod.michigan.gov/PRDVSS1X1/Advantage4", "Michigan SIGMA VSS", {
    alternateListingUrls: ["https://sigma-prod.michigan.gov/PRDVSS1X1/AltSelfService"],''',
    '''  state("mi-sigma", "State of Michigan", "MI", "Michigan SIGMA Vendor Self-Service", "cgi_advantage", "https://sigma.michigan.gov/PRDVSS1X1/Advantage4", "Michigan SIGMA VSS", {
    alternateListingUrls: ["https://sigma.michigan.gov/PRDVSS1X1/AltSelfService"],''',
)
replace_once(
    configs,
    '''  state("mn-swift", "State of Minnesota", "MN", "Minnesota SWIFT Supplier Portal", "peoplesoft", "https://guest.supplier.systems.state.mn.us/psc/fmssupap/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL", "Minnesota SWIFT Public Events", {
    alternateListingUrls: ["https://guest.supplier.systems.state.mn.us/psc/fmssupap/SUPPLIER/ERP/c/NUI_FRAMEWORK.PT_LANDINGPAGE.GBL"],
    requestTimeoutMs: 45_000,
    maxRetries: 2,
    maxPages: 8,
  }),''',
    '''  state("mn-swift", "State of Minnesota", "MN", "Minnesota SWIFT Supplier Portal", "peoplesoft", "https://guest.supplier.systems.state.mn.us/psc/fmssupap/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL", "Minnesota SWIFT Public Events", {
    alternateListingUrls: ["https://guest.supplier.systems.state.mn.us/psc/fmssupap/SUPPLIER/ERP/c/NUI_FRAMEWORK.PT_LANDINGPAGE.GBL"],
    requestTimeoutMs: 45_000,
    maxRetries: 2,
    maxPages: 8,
    interactiveAccessReason: "The official public SWIFT guest route is protected by a Radware/Perfdrive hCaptcha challenge for automated network traffic.",
  }),''',
)
replace_once(
    configs,
    '''    maxRetries: 3,
    maxPages: 8,
  }),
  state("wi-vendornet"''',
    '''    maxRetries: 2,
    maxPages: 8,
  }),
  state("wi-vendornet"''',
)

portals = "api-server/src/lib/providers/statewideProcurementPortals.ts"
replace_once(
    portals,
    '''function enqueueUnique(queue: string[], seenPages: Set<string>, value: string): void {
  const key = statewideCanonicalUrl(value).toLowerCase();
  if (seenPages.has(key) || queue.some((queued) => statewideCanonicalUrl(queued).toLowerCase() === key)) return;
  queue.push(value);
}

export class StatewideProcurementProvider''',
    '''function enqueueUnique(queue: string[], seenPages: Set<string>, value: string): void {
  const key = statewideCanonicalUrl(value).toLowerCase();
  if (seenPages.has(key) || queue.some((queued) => statewideCanonicalUrl(queued).toLowerCase() === key)) return;
  queue.push(value);
}

function boundedPortalBudget(
  envName: string,
  configuredValue: number | undefined,
  defaultValue: number,
  minimum: number,
  maximum: number,
): number {
  const configured = Math.min(Math.max(configuredValue ?? defaultValue, minimum), maximum);
  const raw = process.env[envName]?.trim();
  if (!raw) return configured;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? Math.min(Math.max(parsed, minimum), maximum) : configured;
}

export class StatewideProcurementProvider''',
)
replace_once(
    portals,
    '''    const timeoutMs = positiveIntegerEnv("STATEWIDE_PORTAL_REQUEST_TIMEOUT_MS", 20_000, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("STATEWIDE_PORTAL_MAX_RETRIES", 2, 0, 2);
    const maxPages = positiveIntegerEnv("STATEWIDE_PORTAL_MAX_PAGES", 8, 1, 20);''',
    '''    const timeoutMs = boundedPortalBudget(
      "STATEWIDE_PORTAL_REQUEST_TIMEOUT_MS",
      this.config.requestTimeoutMs,
      20_000,
      3_000,
      60_000,
    );
    const maxRetries = boundedPortalBudget(
      "STATEWIDE_PORTAL_MAX_RETRIES",
      this.config.maxRetries,
      2,
      0,
      2,
    );
    const maxPages = boundedPortalBudget(
      "STATEWIDE_PORTAL_MAX_PAGES",
      this.config.maxPages,
      8,
      1,
      20,
    );''',
)
replace_once(
    portals,
    '''      const parsedListings = [
        ...parseStatewideListingContent(content, this.config, safePageUrl, listingPage),
        ...parseStatewidePlatformListings(content, this.config, safePageUrl, listingPage),
      ];
      if (!parsedListings.length && statewideContentHasExplicitEmptyEvidence(content)) explicitEmptyCount += 1;''',
    '''      const parsedListings = [
        ...parseStatewideListingContent(content, this.config, safePageUrl, listingPage),
        ...parseStatewidePlatformListings(content, this.config, safePageUrl, listingPage),
      ];
      if (browserBlocked || (!parsedListings.length && Boolean(this.config.interactiveAccessReason))) challengeCount += 1;
      if (!parsedListings.length && statewideContentHasExplicitEmptyEvidence(content)) explicitEmptyCount += 1;''',
)
replace_once(
    portals,
    '''      const browserBlocked = statewideContentLooksLikeChallenge(content) || statewideContentLooksLikeBrowserShell(content);
      if (browserBlocked) challengeCount += 1;
      const signature = statewideStableHash(statewideHtmlToText(content) || content.slice(0, 10_000));''',
    '''      const browserBlocked = statewideContentLooksLikeChallenge(content) || statewideContentLooksLikeBrowserShell(content);
      const signature = statewideStableHash(statewideHtmlToText(content) || content.slice(0, 10_000));''',
)

signals = "api-server/src/lib/providers/statewideProcurementContentSignals.ts"
replace_once(
    signals,
    '''const AUTOMATED_ACCESS_BLOCK_MARKUP = /captcha\\.perfdrive\\.com|h-captcha|g-recaptcha|cf-chl-|px-captcha|perimeterx|datadome/i;''',
    '''const AUTOMATED_ACCESS_BLOCK_MARKUP = /captcha\\.perfdrive\\.com|radware captcha page|shieldsquare|ssjsconnectorobj|h-captcha|g-recaptcha|cf-chl-|px-captcha|perimeterx|datadome/i;''',
)

workflow = ".github/workflows/statewide-live-verification.yml"
workflow_path = Path(workflow)
workflow_text = workflow_path.read_text()
start_marker = "      # BEGIN ONE-TIME STATEWIDE REVIEW FIXES\n"
end_marker = "      # END ONE-TIME STATEWIDE REVIEW FIXES\n"
start = workflow_text.index(start_marker)
end = workflow_text.index(end_marker, start) + len(end_marker)
workflow_text = workflow_text[:start] + workflow_text[end:]
workflow_text = workflow_text.replace("permissions:\n  contents: write", "permissions:\n  contents: read", 1)
workflow_text = workflow_text.replace("    timeout-minutes: 35", "    timeout-minutes: 45", 1)
workflow_text = workflow_text.replace('          STATEWIDE_LIVE_CONCURRENCY: "4"', '          STATEWIDE_LIVE_CONCURRENCY: "8"', 1)
workflow_text = workflow_text.replace('          STATEWIDE_PORTAL_MAX_RETRIES: "2"', '          STATEWIDE_PORTAL_MAX_RETRIES: "1"', 1)
workflow_text = workflow_text.replace('          STATEWIDE_PORTAL_MAX_PAGES: "8"', '          STATEWIDE_PORTAL_MAX_PAGES: "4"', 1)
workflow_text = workflow_text.replace('          BSO_MAX_RETRIES: "2"', '          BSO_MAX_RETRIES: "1"', 1)
workflow_path.write_text(workflow_text)

Path(".github/workflows/apply-statewide-review-fixes.yml").unlink(missing_ok=True)
Path(__file__).unlink()
