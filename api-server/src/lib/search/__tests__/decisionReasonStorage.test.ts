import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizedToDbRecord } from "../normalization";

describe("decision reason storage", () => {
  const base = {
    externalId: "t-1",
    title: "Occupational Health Services",
    agency: "DEPT OF VETERANS AFFAIRS",
    type: "Solicitation",
    status: "active" as const,
    postedDate: new Date("2026-09-20"),
    responseDeadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    description: "Employee medical examinations and drug testing.",
    sourceUrl: "https://sam.gov/opp/t-1/view",
    source: "tango" as const,
  };

  it("keeps the judge's reason in its own segment even when the provider sets its own note", () => {
    const db = normalizedToDbRecord({
      ...base,
      rawData: {
        providerName: "tango",
        notes: "Collected directly from the Tango API.",
        relevanceReason: "Core scope purchases employee medical exams [open].",
        opportunityDecisionMethod: "panel-ai-review",
      },
    }) as any;
    assert.match(db.notes, /\[why: Core scope purchases employee medical exams open\. \| via: panel-ai-review\]/);
    assert.match(db.notes, /Collected directly from the Tango API\./);
  });

  it("omits the segment when there is no reason", () => {
    const db = normalizedToDbRecord({ ...base, rawData: { providerName: "tango" } }) as any;
    assert.doesNotMatch(db.notes ?? "", /\[why:/);
  });
});
