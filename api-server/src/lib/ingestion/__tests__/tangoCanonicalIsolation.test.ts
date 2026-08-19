import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalProviderAuthority,
  mergeSourceRefresh,
} from "../pipelineRules";

describe("Tango canonical ownership isolation", () => {
  it("keeps Tango below AI discovery authority", () => {
    assert.ok(
      canonicalProviderAuthority("aiDiscovery") >
        canonicalProviderAuthority("tango"),
    );
  });

  it("prevents Tango from overwriting an AI-discovered canonical record", () => {
    const existing = {
      providerName: "aiDiscovery",
      providerKey: "aiDiscovery",
      source: "aiDiscovery",
      noticeId: "AI-123",
      title: "Occupational Health Services for Employees",
      description:
        "Pre-employment physicals, medical surveillance, audiometry, and drug testing.",
      samUrl: "https://sam.gov/opp/example/view",
      sourceConfidence: "medium",
    };
    const incoming = {
      providerName: "tango",
      providerKey: "tango",
      source: "tango",
      noticeId: "TANGO-123",
      title: "Generic medical services",
      description: "Thin Tango metadata.",
      samUrl: "https://tango.example/opportunity/123",
      sourceConfidence: "high",
    };

    const merged = mergeSourceRefresh(existing, incoming);

    assert.equal(merged.providerName, "aiDiscovery");
    assert.equal(merged.noticeId, "AI-123");
    assert.equal(merged.title, existing.title);
    assert.equal(merged.description, existing.description);
    assert.equal(merged.samUrl, existing.samUrl);
  });

  it("allows AI discovery to reclaim a canonical record previously owned by Tango", () => {
    const existing = {
      providerName: "tango",
      providerKey: "tango",
      source: "tango",
      noticeId: "TANGO-123",
      title: "Generic medical services",
      description: "Thin Tango metadata.",
      samUrl: "https://tango.example/opportunity/123",
      sourceConfidence: "high",
    };
    const incoming = {
      providerName: "aiDiscovery",
      providerKey: "aiDiscovery",
      source: "aiDiscovery",
      noticeId: "AI-123",
      title: "Occupational Health Services for Employees",
      description:
        "Pre-employment physicals, medical surveillance, audiometry, and drug testing.",
      samUrl: "https://sam.gov/opp/example/view",
      sourceConfidence: "medium",
    };

    const merged = mergeSourceRefresh(existing, incoming);

    assert.equal(merged.providerName, "aiDiscovery");
    assert.equal(merged.noticeId, "AI-123");
    assert.equal(merged.title, incoming.title);
    assert.equal(merged.description, incoming.description);
    assert.equal(merged.samUrl, incoming.samUrl);
  });
});
