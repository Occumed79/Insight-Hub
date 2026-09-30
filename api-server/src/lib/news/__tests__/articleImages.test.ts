import assert from "node:assert/strict";
import test from "node:test";
import { publisherImage, publisherImageFromHtml } from "../articleImages";

test("publisher metadata resolves real photo URLs in either attribute order", () => {
  assert.equal(publisherImageFromHtml('<meta content="/fighter.jpg?a=1&amp;b=2" property="og:image">', "https://www.defensenews.com/story/"), "https://www.defensenews.com/fighter.jpg?a=1&b=2");
  assert.equal(publisherImageFromHtml("<meta name='twitter:image' content='https://aviationweek.com/mv75.jpg'>", "https://aviationweek.com/story"), "https://aviationweek.com/mv75.jpg");
  assert.equal(publisherImageFromHtml('<meta property="og:image" content="javascript:alert(1)">', "https://aviationweek.com/story"), null);
});

test("photo lookup caches publisher metadata and refuses off-publication pages and redirects", async () => {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith("/redirect-test")) return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } });
    return new Response('<head><meta property="og:image" content="https://cdn.example.com/fighter.jpg"></head>', { headers: { "content-type": "text/html" } });
  };
  try {
    assert.equal(await publisherImage("https://www.defensenews.com/photo-test"), "https://cdn.example.com/fighter.jpg");
    assert.equal(await publisherImage("https://www.defensenews.com/photo-test"), "https://cdn.example.com/fighter.jpg");
    assert.equal(await publisherImage("https://defensenews.com.attacker.example/story"), null);
    assert.equal(await publisherImage("http://127.0.0.1/private"), null);
    assert.equal(await publisherImage("https://www.defensenews.com/redirect-test"), null);
    assert.equal(requests.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});
