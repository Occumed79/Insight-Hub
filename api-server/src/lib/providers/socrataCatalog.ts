import { composeAbortSignal } from "./abortSignals";

const SOCRATA_DISCOVERY_URL = "https://api.us.socrata.com/api/catalog/v1";
const REQUEST_TIMEOUT_MS = 20_000;

export interface SocrataCatalogResult {
  title: string;
  description: string;
  url: string;
  domain?: string;
  assetId?: string;
  updatedAt?: string;
}

/**
 * Search Tyler/Socrata's global catalogue for reusable datasets.
 *
 * IMPORTANT: catalogue results describe feeds, not procurement opportunities.
 * Callers may use these records to qualify/maintain the dataset registry, but
 * they must never normalize a catalogue result directly into an opportunity.
 */
export async function searchSocrataCatalog(
  query: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<SocrataCatalogResult[]> {
  const url = new URL(SOCRATA_DISCOVERY_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("only", "datasets");
  url.searchParams.set("limit", "20");
  const requestSignal = composeAbortSignal(REQUEST_TIMEOUT_MS, signal);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json", ...headers },
      signal: requestSignal.signal,
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `Socrata Discovery API error ${response.status}: ${body.slice(0, 200)}`,
      );
    }
    const json = JSON.parse(body) as {
      results?: Array<{
        resource?: {
          name?: string;
          description?: string;
          id?: string;
          updatedAt?: string;
        };
        metadata?: { domain?: string };
        permalink?: string;
      }>;
    };
    return (json.results ?? []).flatMap((result) => {
      const domain = result.metadata?.domain;
      const assetId = result.resource?.id;
      const resultUrl =
        result.permalink ||
        (domain && assetId ? `https://${domain}/d/${assetId}` : "");
      return resultUrl
        ? [
            {
              title: result.resource?.name ?? resultUrl,
              description: result.resource?.description ?? "",
              url: resultUrl,
              domain,
              assetId,
              updatedAt: result.resource?.updatedAt,
            },
          ]
        : [];
    });
  } finally {
    requestSignal.cleanup();
  }
}
