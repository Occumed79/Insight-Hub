import assert from "node:assert/strict";
import test from "node:test";
import { relevantNewsScore } from "../relevant-news";

test("federal-context gate keeps generic corporate awards below the live admission threshold", () => {
  const genericCorporate = relevantNewsScore({
    title: "Tata Technologies clarifies Honda contract award",
    description: "Private vehicle development programme for a Japanese OEM.",
    source: { name: "CNBC TV18", country: "in" },
  });
  const federalDefense = relevantNewsScore({
    title: "U.S. Navy awards maintenance contract",
    description: "Navy procurement award for fleet support services.",
    source: { name: "Defense publication", country: "us" },
  });

  assert.ok(genericCorporate < 6);
  assert.ok(federalDefense >= 6);
});
