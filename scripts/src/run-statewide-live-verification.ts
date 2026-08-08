import { runStatewideLiveVerification } from "../../api-server/src/lib/providers/runStatewideLiveVerification";
import { OfficialPlatformSession } from "../../api-server/src/lib/providers/officialPlatformSession";
import { PEOPLESOFT_TENANTS } from "../../api-server/src/lib/providers/peopleSoftPublic";

function htmlText(value: string): string {
  return value
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function pageTitle(html: string): string {
  const raw = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return htmlText(raw).slice(0, 120) || "untitled";
}

function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}`;
  } catch {
    return value.slice(0, 240);
  }
}

async function diagnoseKansasPeopleSoft(): Promise<void> {
  const tenant = PEOPLESOFT_TENANTS.find((item) => item.portalId === "ks-esupplier");
  if (!tenant) return;

  const urls = [tenant.listingUrl, ...(tenant.alternateListingUrls ?? [])];
  const origin = new URL(tenant.listingUrl).origin;
  const session = new OfficialPlatformSession([origin], "Kansas PeopleSoft live diagnostic");
  const diagnostics: Array<Record<string, unknown>> = [];

  for (const seed of urls) {
    try {
      const page = await session.requestText(seed, {
        timeoutMs: 12_000,
        maxRetries: 0,
      });
      const body = page.body;
      diagnostics.push({
        seed: safeUrl(seed),
        final: safeUrl(page.url),
        bytes: body.length,
        title: pageTitle(body),
        tableRows: body.match(/<tr\b/gi)?.length ?? 0,
        hiddenFields: body.match(/<input\b[^>]*type=["']hidden["']/gi)?.length ?? 0,
        submitActions: body.match(/submitAction_[^(]*\(/gi)?.length ?? 0,
        formPresent: /<form\b/i.test(body),
        bidGridMarker: /Bidding Event Information|Event Name|SCP_PUB_BIDLIST_FL/i.test(body),
        cookieCheck: /cookies enabled|errorPg=ckreq|return to sign in with cookies enabled/i.test(body),
        loginMarker: /PeopleSoft Sign-in|cmd=login|name=["']userid["']|name=["']pwd["']/i.test(body),
      });
    } catch (error) {
      diagnostics.push({
        seed: safeUrl(seed),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.error(
    JSON.stringify({
      event: "kansas_peoplesoft_live_diagnostic",
      diagnostics,
    }),
  );
}

runStatewideLiveVerification()
  .then(async (results) => {
    const kansas = results.find((result) => result.portalId === "ks-esupplier");
    if (kansas?.status === "PARSER_FAILURE" || kansas?.status === "BAD_ENDPOINT") {
      await diagnoseKansasPeopleSoft();
    }
  })
  .catch(async (error) => {
    await diagnoseKansasPeopleSoft().catch((diagnosticError) => {
      console.error(
        JSON.stringify({
          event: "kansas_peoplesoft_live_diagnostic_failed",
          error:
            diagnosticError instanceof Error
              ? diagnosticError.message
              : String(diagnosticError),
        }),
      );
    });
    console.error(error);
    process.exitCode = 1;
  });
