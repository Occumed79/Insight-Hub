import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyResult } from "../relevance";

const procurement =
  "Request for proposal. Proposals due next month. Scope of services includes ";
function accepted(title: string, description: string) {
  const r = classifyResult({
    title,
    description: procurement + description,
    allowHistorical: true,
  });
  assert.equal(r.rejected, false, JSON.stringify(r, null, 2));
  assert.ok(r.score >= 70, JSON.stringify(r, null, 2));
  return r;
}
function rejected(title: string, description: string) {
  const r = classifyResult({ title, description, allowHistorical: true });
  assert.equal(r.rejected, true, JSON.stringify(r, null, 2));
  return r;
}

describe("Occu-Med procurement relevance", () => {
  it("accepts required true positives", () => {
    accepted(
      "Occupational Health and Medical Services Support",
      "pre-employment examinations, DOT physicals, fit-for-duty, return-to-work, and public-safety physicals for employees",
    );
    accepted(
      "Employment Physical Examinations and Drug Screens",
      "applicant physicals, stress testing, vision testing, audiograms, respirator questionnaires, and pulmonary-function testing",
    );
    accepted(
      "Medical Examinations and Fitness Determinations for Protective Service Division",
      "medical examinations, essential job functions, fitness determination, protective service division applicants",
    );
    accepted(
      "Respirator Fit Testing Services",
      "respirator fit testing services, respirator medical clearance, spirometry for employees",
    );
    const equipment = classifyResult({
      title: "Respirator Fit Testing System",
      description:
        "Request for quote for purchase of equipment only: respirator fit testing system and laboratory supplies.",
      allowHistorical: true,
    });
    assert.equal(equipment.rejected, true);
    accepted(
      "Hearing Conservation and Respiratory Protection Program",
      "audiometric testing, medical clearance, respirator fit testing, employees",
    );
    accepted(
      "Wellness Clinic",
      "occupational health services, DOT physicals, non-DOT physicals, drug screens, BAT, MRO, and public-safety exams",
    );
    accepted(
      "Local Nationals Occupational Health Examinations",
      "local nationals occupational health examinations and contractor personnel medical screening",
    );
    accepted(
      "Pre-employment Physicals, Drug and TB Testing",
      "pre-employment physicals, drug testing services, TB testing for applicants",
    );
  });
  it("rejects required false positives", () => {
    rejected(
      "Transportation Services RFP",
      "The transportation contractor must maintain its own drug-testing policy for drivers; no testing services are purchased.",
    );
    rejected(
      "Pre-employment Background Screening",
      "RFP for criminal history, fingerprinting, credential verification and employment verification only.",
    );
    rejected(
      "Occupational Health and Safety Consulting",
      "Solicitation for safety training, policy development, and OHS management system only.",
    );
    rejected(
      "Drug-testing kits and laboratory supplies",
      "Request for quote for test kits and laboratory supplies only.",
    );
    rejected(
      "Employee Health Insurance Benefits",
      "RFP for health insurance, claims administration, pharmacy benefits and benefits administration.",
    );
    rejected(
      "Medical Research Drug Screening",
      "Solicitation for pharmaceutical research and preclinical drug screening of compounds.",
    );
    rejected(
      "Occupational Health Nurse Job Posting",
      "Now hiring registered nurse manager at occupational-health clinic.",
    );
    rejected(
      "Award Notice: Occupational Health Services",
      "Executed contract and notice of award for occupational health services.",
    );
  });
});
