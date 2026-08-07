import assert from "node:assert/strict";
import test from "node:test";
import { classifyResult } from "../search/relevance";

type Fixture = {
  label: boolean;
  title: string;
  description: string;
  url?: string;
};

const FIXTURES: Fixture[] = [
  {
    label: true,
    title: "RFP - Occupational Health and Medical Surveillance Services",
    description: "Request for proposal for employee occupational medicine examinations, medical surveillance, and fitness-for-duty services.",
    url: "https://example.gov/rfp/occ-health",
  },
  {
    label: true,
    title: "Solicitation for Drug and Alcohol Testing Services",
    description: "The agency seeks a contractor to provide workforce drug testing, urine collections, MRO support, and breath alcohol testing.",
    url: "https://sam.gov/opp/drug-testing/view",
  },
  {
    label: true,
    title: "Audiometric Testing and Hearing Conservation RFP",
    description: "Competitive procurement for employee audiograms, audiometric testing, and occupational hearing conservation program support.",
    url: "https://example.gov/bids/hearing",
  },
  {
    label: true,
    title: "Respiratory Protection Medical Evaluation and Fit Testing RFQ",
    description: "Request for quote for employee respirator medical evaluations, quantitative fit testing, and spirometry services.",
    url: "https://example.gov/rfq/respiratory",
  },
  {
    label: true,
    title: "Pre-Employment Physical Examination Services Solicitation",
    description: "Agency procurement for pre-employment physical exams, fitness-for-duty examinations, vision screening, and laboratory testing.",
    url: "https://sam.gov/opp/physicals/view",
  },
  {
    label: true,
    title: "Deployment Medical Screening Services RFP",
    description: "The government requests proposals for pre-deployment medical examinations, immunizations, medical screening, and readiness services for contractor personnel.",
    url: "https://example.mil/contracts/deployment-medical",
  },
  {
    label: true,
    title: "Employee Health Vaccination and TB Testing Contract",
    description: "Invitation to bid for workforce health vaccinations, immunizations, titers, tuberculosis testing, and occupational health clinic support.",
    url: "https://example.gov/procurement/employee-health",
  },
  {
    label: true,
    title: "Occupational Health Provider Network Management RFP",
    description: "Request for proposals to manage a nationwide provider network delivering medical examinations, drug testing, reporting, and occupational health services.",
    url: "https://example.gov/rfp/provider-network",
  },
  {
    label: true,
    title: "DOT Physical and Drug Testing Services Bid",
    description: "Competitive bid for DOT medical examinations, 49 CFR Part 40 collections, breath alcohol testing, and employee health services.",
    url: "https://example.gov/bids/dot",
  },
  {
    label: true,
    title: "NFPA 1582 Firefighter Medical Examination RFP",
    description: "Solicitation for NFPA 1582 annual physical examinations, laboratory testing, audiograms, spirometry, and fitness-for-duty medical evaluations.",
    url: "https://example.gov/rfp/nfpa1582",
  },
  {
    label: true,
    title: "OSHA Lead and Asbestos Medical Surveillance Solicitation",
    description: "Procurement for employee medical surveillance related to lead, asbestos, and silica exposure including physical examinations and laboratory testing.",
    url: "https://example.gov/solicitation/surveillance",
  },
  {
    label: true,
    title: "Occupational Medicine PFT and Spirometry Services RFQ",
    description: "Request for quotation for pulmonary function testing, spirometry, respirator clearance, and occupational medicine services for employees.",
    url: "https://example.gov/rfq/pft",
  },
  {
    label: false,
    title: "Ambulance and Emergency Medical Services RFP",
    description: "Request for proposals for ambulance transport, EMT staffing, and emergency response services.",
    url: "https://example.gov/rfp/ambulance",
  },
  {
    label: false,
    title: "Registered Nurse Staffing Solicitation",
    description: "Agency seeks temporary registered nurses and clinical staffing personnel for inpatient units.",
    url: "https://example.gov/rfp/nurse-staffing",
  },
  {
    label: false,
    title: "Electronic Health Record Software Implementation RFP",
    description: "Procurement for EHR software licenses, cloud hosting, cybersecurity, and implementation services.",
    url: "https://example.gov/rfp/ehr",
  },
  {
    label: false,
    title: "Medical Equipment and Pharmaceutical Supplies Bid",
    description: "Invitation to bid for diagnostic equipment, pharmaceuticals, medication dispensing supplies, and consumables.",
    url: "https://example.gov/bids/supplies",
  },
  {
    label: false,
    title: "Healthcare Facility Construction Solicitation",
    description: "Request for proposals to construct and renovate a clinic building. Contractor employees must comply with drug testing requirements.",
    url: "https://example.gov/rfp/construction",
  },
  {
    label: false,
    title: "Behavioral Health Treatment Program RFP",
    description: "Procurement for psychotherapy, crisis intervention, addiction treatment, and inpatient behavioral health care.",
    url: "https://example.gov/rfp/behavioral",
  },
  {
    label: false,
    title: "Employee Health Insurance Benefits Administration RFP",
    description: "Request for proposals for health insurance enrollment, claims administration, COBRA, and employee benefits administration.",
    url: "https://example.gov/rfp/benefits",
  },
  {
    label: false,
    title: "Notice of Award - Occupational Health Services",
    description: "Contract awarded to the selected vendor. This notice publishes the award result and is not accepting proposals.",
    url: "https://sam.gov/opp/award/view",
  },
  {
    label: false,
    title: "Occupational Health Nurse Manager Job Opening",
    description: "Now hiring an occupational health nurse manager. Submit your resume and apply now.",
    url: "https://www.indeed.com/viewjob",
  },
  {
    label: false,
    title: "Janitorial Services Contract RFP",
    description: "Request for proposals for custodial, cleaning, landscaping, and facility maintenance services.",
    url: "https://example.gov/rfp/janitorial",
  },
  {
    label: false,
    title: "News: Agency Expands Workplace Health Program",
    description: "Press release and news article describing an existing employee wellness initiative. No solicitation is open.",
    url: "https://example.gov/news/workplace-health",
  },
  {
    label: false,
    title: "General IT Staff Augmentation RFP",
    description: "Request for proposal for software developers, project managers, help desk staff, and IT support. Vendor personnel must pass pre-employment drug screening.",
    url: "https://example.gov/rfp/it-staff",
  },
];

function predicted(fixture: Fixture): boolean {
  const result = classifyResult({
    title: fixture.title,
    description: fixture.description,
    url: fixture.url,
    deadlineInFuture: true,
    allowHistorical: true,
  });
  return (
    !result.rejected &&
    result.score >= 65 &&
    result.confidence !== "possible_adjacent" &&
    result.confidence !== "insufficient"
  );
}

export function benchmarkMetrics(fixtures = FIXTURES) {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  const mistakes: Array<{ title: string; expected: boolean; actual: boolean }> = [];
  for (const fixture of fixtures) {
    const actual = predicted(fixture);
    if (fixture.label && actual) tp += 1;
    else if (!fixture.label && actual) fp += 1;
    else if (fixture.label && !actual) fn += 1;
    else tn += 1;
    if (fixture.label !== actual) {
      mistakes.push({ title: fixture.title, expected: fixture.label, actual });
    }
  }
  return {
    tp,
    fp,
    fn,
    tn,
    precision: tp / Math.max(1, tp + fp),
    recall: tp / Math.max(1, tp + fn),
    mistakes,
  };
}

test("opportunity acceptance benchmark meets precision and recall floors", () => {
  const metrics = benchmarkMetrics();
  assert.ok(
    metrics.precision >= 0.9,
    `precision ${(metrics.precision * 100).toFixed(1)}% below 90%; ${JSON.stringify(metrics.mistakes)}`,
  );
  assert.ok(
    metrics.recall >= 0.85,
    `recall ${(metrics.recall * 100).toFixed(1)}% below 85%; ${JSON.stringify(metrics.mistakes)}`,
  );
});
