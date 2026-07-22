export interface OfficialPortalRequestOptions {
  label: string;
  origin: string;
  timeoutMs: number;
  maxRetries: number;
  signal?: AbortSignal;
}

const NEXT_TEXT = /^(?:next|next page|older|older notices|more results|continue|›|»|→)$/i;

export function positiveIntegerEnv(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number.parseInt(process.env[name] ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function sameOriginUrl(value: string, expectedOrigin: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.origin !== expectedOrigin) return undefined;
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

export function extractSameOriginPaginationUrls(
  html: string,
  pageUrl: string,
  expectedOrigin: string,
  limit = 12,
): string[] {
  const current = new URL(pageUrl).toString().replace(/#.*$/, "").toLowerCase();
  const candidates: Array<{ url: string; priority: number }> = [];
  const anchors = Array.from(
    html.matchAll(/<a\b([^>]*)href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi),
  );

  for (const anchor of anchors) {
    const attributes = anchor[1] ?? "";
    const href = anchor[2] ?? "";
    const text = stripMarkup(anchor[3] ?? "").trim();
    let absolute: URL;
    try {
      absolute = new URL(href, pageUrl);
    } catch {
      continue;
    }
    if (absolute.origin !== expectedOrigin) continue;
    absolute.hash = "";
    const normalized = absolute.toString().toLowerCase();
    if (normalized === current) continue;

    const relNext = /\brel\s*=\s*["'][^"']*\bnext\b/i.test(attributes);
    const paginationMarkup = /\b(?:pagination|pager|page-link|page-item|next)\b/i.test(attributes);
    const explicitNext = NEXT_TEXT.test(text);
    const numberedPage = /^\d{1,4}$/.test(text) && paginationMarkup;
    const queryPagination = /[?&](?:page|p|pageNumber|pageIndex|offset)=\d+/i.test(absolute.search);
    if (!relNext && !explicitNext && !numberedPage && !(paginationMarkup && queryPagination)) continue;

    candidates.push({
      url: absolute.toString(),
      priority: relNext ? 0 : explicitNext ? 1 : numberedPage ? 2 : 3,
    });
  }

  const deduped = new Map<string, string>();
  for (const candidate of candidates.sort((left, right) => left.priority - right.priority)) {
    const key = candidate.url.toLowerCase();
    if (!deduped.has(key)) deduped.set(key, candidate.url);
  }
  return Array.from(deduped.values()).slice(0, Math.max(0, limit));
}

export function describeOfficialPortalRequestError(
  error: unknown,
  label: string,
  timeoutMs: number,
): string {
  if (!(error instanceof Error)) return `${label} request failed: ${String(error)}`;
  if (error.name === "AbortError") return `${label} timed out after ${timeoutMs}ms`;
  if (error.message.startsWith(`${label} `)) return error.message;

  const cause = (error as Error & { cause?: unknown }).cause;
  const details = cause && typeof cause === "object"
    ? cause as Record<string, unknown>
    : undefined;
  const diagnostics = ["code", "syscall", "hostname", "address", "port"].flatMap((key) => {
    const value = details?.[key];
    return value === undefined || value === null || value === ""
      ? []
      : [`${key}=${String(value)}`];
  });
  const suffix = diagnostics.length ? ` (${diagnostics.join(", ")})` : "";
  return `${label} network request failed${suffix}: ${error.message}`;
}

export async function fetchOfficialPortalText(
  url: string,
  options: OfficialPortalRequestOptions,
): Promise<string> {
  const safeUrl = sameOriginUrl(url, options.origin);
  if (!safeUrl) throw new Error(`${options.label} rejected a cross-origin URL`);

  let lastError: unknown;
  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    const controller = new AbortController();
    const abortFromParent = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) abortFromParent();
    else options.signal?.addEventListener("abort", abortFromParent, { once: true });
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const response = await fetch(safeUrl, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "user-agent": "OccuMed-InsightHub/1.0 public-procurement-reader (+https://www.occumed.com)",
        },
      });

      if (response.url && new URL(response.url).origin !== options.origin) {
        throw new Error(`${options.label} redirected outside its official origin`);
      }

      if (response.ok) return await response.text();

      const body = await response.text().catch(() => "");
      const retryable = response.status === 429 || response.status >= 500;
      const message = `${options.label} returned HTTP ${response.status}${body ? `: ${body.slice(0, 160)}` : ""}`;
      if (!retryable || attempt >= options.maxRetries) throw new Error(message);

      const retryAfter = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
      await sleep(Number.isFinite(retryAfter) ? Math.min(retryAfter * 1000, 10_000) : 400 * 2 ** attempt);
      lastError = new Error(message);
    } catch (error) {
      lastError = error;
      if (attempt >= options.maxRetries) break;
      await sleep(400 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortFromParent);
    }
  }

  throw new Error(describeOfficialPortalRequestError(lastError, options.label, options.timeoutMs));
}

function stripMarkup(value: string): string {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
