const SEARCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "bid",
  "bids",
  "contract",
  "contracts",
  "find",
  "for",
  "government",
  "in",
  "me",
  "of",
  "open",
  "opportunities",
  "opportunity",
  "procurement",
  "proposal",
  "proposals",
  "request",
  "rfp",
  "rfq",
  "service",
  "services",
  "solicitation",
  "the",
  "to",
]);

export function meaningfulLocalSearchTerms(query: string): string[] {
  const all = Array.from(
    new Set(
      query
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean),
    ),
  );
  const meaningful = all.filter(
    (term) => term.length >= 2 && !SEARCH_STOP_WORDS.has(term),
  );
  return meaningful.length > 0 ? meaningful : all;
}
