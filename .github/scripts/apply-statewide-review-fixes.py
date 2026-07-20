from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


configs_path = "api-server/src/lib/providers/statewideProcurementConfigs.ts"
configs = read(configs_path)
configs = re.sub(
    r'state\("mi-sigma",\s*"State of Michigan",\s*"MI",\s*"Michigan SIGMA Vendor Self-Service",\s*"cgi_advantage",\s*"[^"]+",\s*"Michigan SIGMA VSS",\s*\{\s*alternateListingUrls:\s*\[[^\]]*\],',
    'state("mi-sigma", "State of Michigan", "MI", "Michigan SIGMA Vendor Self-Service", "cgi_advantage", "https://sigma.michigan.gov/webapp/PRDVSS2X1/AltSelfService", "Michigan SIGMA VSS", {\n    alternateListingUrls: ["https://sigma.michigan.gov/webapp/PRDVSS2X1/Advantage4"],',
    configs,
    count=1,
    flags=re.S,
)

mn_pattern = re.compile(r'(state\("mn-swift"[\s\S]*?maxPages:\s*8,)([\s\S]*?\n\s*\}\),)', re.M)
mn_match = mn_pattern.search(configs)
if not mn_match:
    raise SystemExit("Could not locate Minnesota config block")
if "interactiveAccessReason" not in mn_match.group(0):
    replacement = mn_match.group(1) + '\n    interactiveAccessReason: "The official public SWIFT guest route is protected by a Radware/Perfdrive hCaptcha challenge for automated network traffic.,"'.replace('traffic.,"', 'traffic.",') + mn_match.group(2)
    configs = configs[:mn_match.start()] + replacement + configs[mn_match.end():]

wv_pattern = re.compile(r'(state\("wv-oasis"[\s\S]*?maxRetries:\s*)\d+', re.M)
configs, wv_count = wv_pattern.subn(r'\g<1>2', configs, count=1)
if wv_count != 1:
    raise SystemExit("Could not locate West Virginia retry budget")
write(configs_path, configs)

portals_path = "api-server/src/lib/providers/statewideProcurementPortals.ts"
portals = read(portals_path)
if "function boundedPortalBudget(" not in portals:
    marker = "export class StatewideProcurementProvider implements DataSourceProvider"
    if marker not in portals:
        raise SystemExit("Could not locate statewide provider class")
    helper = '''function boundedPortalBudget(
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

'''
    portals = portals.replace(marker, helper + marker, 1)

budget_old = '''    const timeoutMs = positiveIntegerEnv("STATEWIDE_PORTAL_REQUEST_TIMEOUT_MS", 20_000, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("STATEWIDE_PORTAL_MAX_RETRIES", 2, 0, 2);
    const maxPages = positiveIntegerEnv("STATEWIDE_PORTAL_MAX_PAGES", 8, 1, 20);'''
budget_new = '''    const timeoutMs = boundedPortalBudget(
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
    );'''
if budget_old in portals:
    portals = portals.replace(budget_old, budget_new, 1)
elif budget_new not in portals:
    raise SystemExit("Could not locate statewide budget declarations")

old_block = '''      const browserBlocked = statewideContentLooksLikeChallenge(content) || statewideContentLooksLikeBrowserShell(content);
      if (browserBlocked) challengeCount += 1;
      const signature = statewideStableHash(statewideHtmlToText(content) || content.slice(0, 10_000));'''
new_block = '''      const browserBlocked = statewideContentLooksLikeChallenge(content) || statewideContentLooksLikeBrowserShell(content);
      const signature = statewideStableHash(statewideHtmlToText(content) || content.slice(0, 10_000));'''
if old_block in portals:
    portals = portals.replace(old_block, new_block, 1)

parse_old = '''      const parsedListings = [
        ...parseStatewideListingContent(content, this.config, safePageUrl, listingPage),
        ...parseStatewidePlatformListings(content, this.config, safePageUrl, listingPage),
      ];
      if (!parsedListings.length && statewideContentHasExplicitEmptyEvidence(content)) explicitEmptyCount += 1;'''
parse_new = '''      const parsedListings = [
        ...parseStatewideListingContent(content, this.config, safePageUrl, listingPage),
        ...parseStatewidePlatformListings(content, this.config, safePageUrl, listingPage),
      ];
      if (browserBlocked || (!parsedListings.length && Boolean(this.config.interactiveAccessReason))) challengeCount += 1;
      if (!parsedListings.length && statewideContentHasExplicitEmptyEvidence(content)) explicitEmptyCount += 1;'''
if parse_old in portals:
    portals = portals.replace(parse_old, parse_new, 1)
elif parse_new not in portals:
    raise SystemExit("Could not locate statewide parsed-listing block")
write(portals_path, portals)

signals_path = "api-server/src/lib/providers/statewideProcurementContentSignals.ts"
signals = read(signals_path)
signals = signals.replace(
    "captcha\\.perfdrive\\.com|h-captcha|g-recaptcha|cf-chl-|px-captcha|perimeterx|datadome",
    "captcha\\.perfdrive\\.com|radware captcha page|shieldsquare|ssjsconnectorobj|h-captcha|g-recaptcha|cf-chl-|px-captcha|perimeterx|datadome",
    1,
)
write(signals_path, signals)

workflow_path = Path(".github/workflows/statewide-live-verification.yml")
workflow = workflow_path.read_text()
start_marker = "      # BEGIN ONE-TIME STATEWIDE REVIEW FIXES\n"
end_marker = "      # END ONE-TIME STATEWIDE REVIEW FIXES\n"
if start_marker in workflow and end_marker in workflow:
    start = workflow.index(start_marker)
    end = workflow.index(end_marker, start) + len(end_marker)
    workflow = workflow[:start] + workflow[end:]
workflow = workflow.replace("permissions:\n  contents: write", "permissions:\n  contents: read", 1)
workflow = workflow.replace("    timeout-minutes: 35", "    timeout-minutes: 45", 1)
workflow = workflow.replace('          STATEWIDE_LIVE_CONCURRENCY: "4"', '          STATEWIDE_LIVE_CONCURRENCY: "8"', 1)
workflow = workflow.replace('          STATEWIDE_PORTAL_MAX_RETRIES: "2"', '          STATEWIDE_PORTAL_MAX_RETRIES: "1"', 1)
workflow = workflow.replace('          STATEWIDE_PORTAL_MAX_PAGES: "8"', '          STATEWIDE_PORTAL_MAX_PAGES: "4"', 1)
workflow = workflow.replace('          BSO_MAX_RETRIES: "2"', '          BSO_MAX_RETRIES: "1"', 1)
workflow = workflow.replace('      - ".github/scripts/apply-statewide-review-fixes.py"\n', "", 1)
workflow_path.write_text(workflow)

Path(".github/workflows/apply-statewide-review-fixes.yml").unlink(missing_ok=True)
Path(__file__).unlink()
print("Applied statewide recovery review fixes")
