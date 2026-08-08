import assert from "node:assert/strict";
import test from "node:test";
import { relevantNewsScore } from "../relevant-news";

test("rejects generic corporate contract-award coverage without federal context", () => {
  const score = relevantNewsScore({
    title: "Honda awards vehicle development contract to Tata Technologies",
    description: "A Japanese automaker awarded a private vehicle program.",
    source: { name: "Business News", country: "in" },
  });
  assert.equal(score, 0);
});

test("accepts U.S. military contract reporting", () => {
  const score = relevantNewsScore({
    title: "Army nears laser weapon contract award",
    description: "The U.S. Army is preparing a defense procurement award.",
    source: { name: "Defense News", country: "us" },
  });
  assert.ok(score >= 6);
});

test("accepts federal occupational-health procurement reporting", () => {
  const score = relevantNewsScore({
    title: "DHS issues solicitation for employee medical services",
    description: "Department of Homeland Security procurement for occupational health examinations.",
    source: { name: "Federal News", country: "us" },
  });
  assert.ok(score >= 6);
});

test("rejects non-U.S. military contract coverage", () => {
  const score = relevantNewsScore({
    title: "British Army contract award announced",
    description: "The UK Ministry of Defence awarded the programme.",
    source: { name: "Defence publication", country: "gb" },
  });
  assert.equal(score, 0);
});

test("does not treat substrings such as Dodge as DoD", () => {
  const score = relevantNewsScore({
    title: "Dodge contract award expands supplier programme",
    description: "A private automotive supplier contract.",
    source: { name: "Auto News", country: "us" },
  });
  assert.equal(score, 0);
});

test("publisher name alone cannot provide federal context", () => {
  const score = relevantNewsScore({
    title: "Honda contract award",
    description: "Private vehicle-development agreement.",
    source: { name: "Federal News", country: "us" },
  });
  assert.equal(score, 0);
});

test("accepts explicit U.S. government contract coverage", () => {
  const score = relevantNewsScore({
    title: "U.S. government contract awarded for medical services",
    description: "United States government procurement supports employee health examinations.",
    source: { name: "Public Sector News", country: "us" },
  });
  assert.ok(score >= 6);
});
