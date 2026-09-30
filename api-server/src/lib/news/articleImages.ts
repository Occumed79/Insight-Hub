const PUBLICATIONS = ["defensenews.com", "defensedaily.com", "aviationweek.com"];
const cache = new Map<string, { image: string | null; expires: number }>();
const pending = new Map<string, Promise<string | null>>();

function publicationUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return null;
    return PUBLICATIONS.some(domain => url.hostname === domain || url.hostname.endsWith(`.${domain}`)) ? url : null;
  } catch { return null; }
}

function decode(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (entity, number: string) => {
      const code = number.startsWith("x") ? parseInt(number.slice(1), 16) : Number(number);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    });
}

export function publisherImageFromHtml(html: string, pageUrl: string): string | null {
  const images = new Map<string, string>();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attributes = new Map<string, string>();
    for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
      attributes.set(match[1]!.toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? ""));
    }
    const property = (attributes.get("property") ?? attributes.get("name") ?? "").toLowerCase();
    const value = attributes.get("content");
    if (value && !images.has(property)) images.set(property, value);
  }
  for (const property of ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) {
    const value = images.get(property);
    if (!value) continue;
    try {
      const url = new URL(value, pageUrl);
      if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) return url.href;
    } catch {}
  }
  return null;
}

async function readPublisherImage(value: string): Promise<string | null> {
  let url = publicationUrl(value);
  const signal = AbortSignal.timeout(8_000);
  for (let redirects = 0; url && redirects < 4; redirects++) {
    const response = await fetch(url, {
      headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0" },
      redirect: "manual", signal,
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      url = location ? publicationUrl(new URL(location, url).href) : null;
      continue;
    }
    if (!response.ok || !response.headers.get("content-type")?.includes("text/html") || !response.body) {
      await response.body?.cancel();
      return null;
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let html = "";
    let bytes = 0;
    try {
      while (bytes < 256_000) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        html += decoder.decode(chunk.value, { stream: true });
        if (/<\/head\s*>/i.test(html)) break;
      }
    } finally { await reader.cancel().catch(() => {}); }
    return publisherImageFromHtml(html, url.href);
  }
  return null;
}

export async function publisherImage(url: string): Promise<string | null> {
  if (!publicationUrl(url)) return null;
  const known = cache.get(url);
  if (known && known.expires > Date.now()) return known.image;
  const active = pending.get(url);
  if (active) return active;
  const request = readPublisherImage(url).catch(() => null).then(image => {
    if (cache.size >= 500) cache.delete(cache.keys().next().value!);
    cache.set(url, { image, expires: Date.now() + (image ? 24 * 60 * 60_000 : 15 * 60_000) });
    return image;
  }).finally(() => pending.delete(url));
  pending.set(url, request);
  return request;
}
