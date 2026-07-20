from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    target = Path(path)
    text = target.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one match, found {count}: {old[:120]!r}")
    target.write_text(text.replace(old, new, 1))


configs = "api-server/src/lib/providers/statewideProcurementConfigs.ts"
replace_once(
    configs,
    'state("mi-sigma", "State of Michigan", "MI", "Michigan SIGMA Vendor Self-Service", "cgi_advantage", "https://sigma.michigan.gov/PRDVSS1X1/AltSelfService", "Michigan SIGMA VSS", {\n    alternateListingUrls: ["https://sigma.michigan.gov/PRDVSS1X1/Advantage4"],',
    'state("mi-sigma", "State of Michigan", "MI", "Michigan SIGMA Vendor Self-Service", "cgi_advantage", "https://sigma-prod.michigan.gov/PRDVSS1X1/Advantage4", "Michigan SIGMA VSS", {\n    alternateListingUrls: ["https://sigma-prod.michigan.gov/PRDVSS1X1/AltSelfService"],',
)
replace_once(
    configs,
    'state("ky-vss", "Commonwealth of Kentucky", "KY", "Kentucky eMARS Vendor Self-Service", "cgi_advantage", "https://emars311.ky.gov/webapp/vssonline/AltSelfService", "Kentucky eMARS VSS", {\n    requestTimeoutMs: 45_000,',
    'state("ky-vss", "Commonwealth of Kentucky", "KY", "Kentucky eMARS Vendor Self-Service", "cgi_advantage", "https://vss.ky.gov/vssprod-ext/Advantage4", "Kentucky eMARS VSS", {\n    alternateListingUrls: ["https://vss.ky.gov/vssprod-ext/AltSelfService"],\n    requestTimeoutMs: 45_000,',
)
replace_once(
    configs,
    'state("mn-swift", "State of Minnesota", "MN", "Minnesota SWIFT Supplier Portal", "peoplesoft", "https://supplier.swift.state.mn.us/psc/fmssupap/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL", "Minnesota SWIFT Public Events", {\n    alternateListingUrls: ["https://supplier.swift.state.mn.us/psc/fmssupap/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUBLIC_MENU_FL.GBL"],',
    'state("mn-swift", "State of Minnesota", "MN", "Minnesota SWIFT Supplier Portal", "peoplesoft", "https://guest.supplier.systems.state.mn.us/psc/fmssupap/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL", "Minnesota SWIFT Public Events", {\n    alternateListingUrls: ["https://guest.supplier.systems.state.mn.us/psc/fmssupap/SUPPLIER/ERP/c/NUI_FRAMEWORK.PT_LANDINGPAGE.GBL"],',
)
replace_once(
    configs,
    '''state("wi-vendornet", "State of Wisconsin", "WI", "Wisconsin VendorNet / eSupplier", "custom_portal", "https://vendornet.wi.gov/Bids.aspx", "Wisconsin VendorNet Public Bids", {
    alternateListingUrls: ["https://esupplier.wi.gov/psp/esupplier/SUPPLIER/ERP/c/NUI_FRAMEWORK.PT_LANDINGPAGE.GBL"],
    allowedOrigins: ["https://esupplier.wi.gov"],
    requestTimeoutMs: 45_000,
    maxRetries: 2,
    maxPages: 8,
    interactiveAccessReason: "VendorNet populates its Telerik grid only after a public RadAjax InitialPageLoad postback.",
  }),''',
    '''state("wi-vendornet", "State of Wisconsin", "WI", "Wisconsin eSupplier / VendorNet", "peoplesoft", "https://esupplier.wi.gov/psc/esupplier_4/SUPPLIER/ERP/c/WI_SS_SELF_SERVICE.WI_SS_BIDDER_BIDS.GBL?page=WI_SS_BIDDER_BIDS", "Wisconsin eSupplier Search Solicitations", {
    alternateListingUrls: [
      "https://esupplier.wi.gov/psc/esupplier_3/SUPPLIER/ERP/c/WI_SS_SELF_SERVICE.WI_SS_BIDDER_BIDS.GBL?page=WI_SS_BIDDER_BIDS",
      "https://esupplier.wi.gov/psc/esupplier_5/SUPPLIER/ERP/c/WI_SS_SELF_SERVICE.WI_SS_PGLT_CURSOL.GBL",
    ],
    requestTimeoutMs: 45_000,
    maxRetries: 2,
    maxPages: 8,
  }),''',
)
replace_once(
    configs,
    'alternateListingUrls: ["https://prd311.wvoasis.gov/PRDVSS1X1/Advantage4", "https://purchasing.wv.gov/vendor/Pages/default.aspx"],\n    allowedOrigins: ["https://purchasing.wv.gov"],',
    'alternateListingUrls: ["https://prd311.wvoasis.gov/PRDVSS1X1/Advantage4", "https://purchasing.wv.gov/vendor/Pages/default.aspx", "https://dep-auth.wv.gov/bto/IHP/Pages/default.aspx"],\n    allowedOrigins: ["https://purchasing.wv.gov", "https://dep-auth.wv.gov"],',
)

portals = "api-server/src/lib/providers/statewideProcurementPortals.ts"
replace_once(
    portals,
    '''          headers: {
            accept: "text/html,application/xhtml+xml,application/json,text/csv;q=0.9,*/*;q=0.8",
            "user-agent": "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)",
            ...(cookie ? { cookie } : {}),
          },''',
    '''          headers: {
            accept: "text/html,application/xhtml+xml,application/json,text/csv;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
            pragma: "no-cache",
            "upgrade-insecure-requests": "1",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
            ...(cookie ? { cookie } : {}),
          },''',
)
replace_once(
    portals,
    '''    const timeoutMs = positiveIntegerEnv("STATEWIDE_PORTAL_REQUEST_TIMEOUT_MS", 20_000, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("STATEWIDE_PORTAL_MAX_RETRIES", 2, 0, 2);
    const maxPages = positiveIntegerEnv("STATEWIDE_PORTAL_MAX_PAGES", 8, 1, 20);''',
    '''    const timeoutMs = Math.max(
      positiveIntegerEnv("STATEWIDE_PORTAL_REQUEST_TIMEOUT_MS", 20_000, 3_000, 60_000),
      this.config.requestTimeoutMs ?? 0,
    );
    const maxRetries = Math.max(
      positiveIntegerEnv("STATEWIDE_PORTAL_MAX_RETRIES", 2, 0, 2),
      this.config.maxRetries ?? 0,
    );
    const maxPages = Math.max(
      positiveIntegerEnv("STATEWIDE_PORTAL_MAX_PAGES", 8, 1, 20),
      this.config.maxPages ?? 1,
    );''',
)

cal = "api-server/src/lib/providers/calEprocure.ts"
replace_once(
    cal,
    '''export const CAL_EPROCURE_SOURCE: PublicPortalSource = {''',
    '''export const CAL_EPROCURE_LISTING_URLS = [
  CAL_EPROCURE_LISTING_URL,
  CAL_EPROCURE_LISTING_URL.replaceAll("psfpd1", "psfpd1_1"),
  CAL_EPROCURE_LISTING_URL.replaceAll("psfpd1", "psfpd1_2"),
] as const;

export const CAL_EPROCURE_SOURCE: PublicPortalSource = {''',
)
replace_once(
    cal,
    '''          headers: {
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "user-agent": "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)",
            ...(this.cookieHeader() ? { cookie: this.cookieHeader() as string } : {}),
          },''',
    '''          headers: {
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.9",
            "cache-control": "no-cache",
            pragma: "no-cache",
            "upgrade-insecure-requests": "1",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
            ...(this.cookieHeader() ? { cookie: this.cookieHeader() as string } : {}),
          },''',
)
replace_once(
    cal,
    '''    const timeoutMs = positiveIntegerEnv("CAL_EPROCURE_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS, 3_000, 60_000);
    const maxRetries = positiveIntegerEnv("CAL_EPROCURE_MAX_RETRIES", DEFAULT_MAX_RETRIES, 0, 2);''',
    '''    const timeoutMs = Math.max(30_000, positiveIntegerEnv("CAL_EPROCURE_REQUEST_TIMEOUT_MS", DEFAULT_REQUEST_TIMEOUT_MS, 3_000, 60_000));
    const maxRetries = Math.max(2, positiveIntegerEnv("CAL_EPROCURE_MAX_RETRIES", DEFAULT_MAX_RETRIES, 0, 2));''',
)
replace_once(cal, "    const queue = [CAL_EPROCURE_LISTING_URL];", "    const queue = Array.from(CAL_EPROCURE_LISTING_URLS);")
replace_once(
    cal,
    '''        if (!listings.size) {
          this.lastError = reason;
          return { records: [], total: 0, errors: [`ca-caleprocure: ${reason}`] };
        }
        errors.push(`ca-caleprocure: partial listing results after ${reason}`);
        break;''',
    '''        errors.push(listings.size
          ? `ca-caleprocure: partial listing results after ${reason}`
          : `ca-caleprocure: ${reason}`);
        continue;''',
)

workflow = Path(".github/workflows/statewide-live-verification.yml")
workflow_text = workflow.read_text()
start = workflow_text.index("      # BEGIN ONE-TIME STATEWIDE RECOVERY PASS 2\n")
end_marker = "      # END ONE-TIME STATEWIDE RECOVERY PASS 2\n"
end = workflow_text.index(end_marker, start) + len(end_marker)
workflow_text = workflow_text[:start] + workflow_text[end:]
workflow_text = workflow_text.replace("permissions:\n  contents: write", "permissions:\n  contents: read", 1)
workflow.write_text(workflow_text)

Path(__file__).unlink()
