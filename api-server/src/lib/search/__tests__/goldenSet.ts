/**
 * Golden set for the Occu-Med relevance gate.
 *
 * Each case is a notice the team would (wanted) or would not (unwanted) want to
 * see. The regression test and the eval script both run the real gate against
 * this list. To improve search quality: when a bad result slips through or a good
 * one is missed, add it here with the expected verdict, then fix the gate until
 * the suite passes.
 *
 * `wanted: true`  -> must NOT be rejected, and should be deterministically actionable
 *                    when it has a future deadline.
 * `wanted: false` -> must be rejected or at least not deterministically actionable.
 */
export interface GoldenCase {
  id: string;
  wanted: boolean;
  title: string;
  agency: string;
  description: string;
  naicsCode?: string;
  note?: string;
}

export const GOLDEN_CASES: GoldenCase[] = [
  // ── Wanted: core Occu-Med scope ──────────────────────────────────────────
  { id: "w-occ-health", wanted: true, title: "Occupational Health and Medical Surveillance Services", agency: "DEPT OF VETERANS AFFAIRS", naicsCode: "621111",
    description: "Pre-employment physicals, fitness-for-duty exams, and audiometric testing for employees." },
  { id: "w-drug-testing", wanted: true, title: "Employee Drug and Alcohol Testing Services", agency: "DEPT OF TRANSPORTATION", naicsCode: "621511",
    description: "Contractor shall provide random, pre-employment and post-accident drug and alcohol testing with MRO review for DOT-covered employees." },
  { id: "w-deploy", wanted: true, title: "Deployment Medical Screening and Readiness Evaluations for Contractor Personnel", agency: "DEPT OF THE ARMY", naicsCode: "621111",
    description: "Medical evaluations supporting overseas deployment of contractor personnel, including physical examinations, immunizations and medical clearance." },
  { id: "w-respirator", wanted: true, title: "Respirator Medical Evaluations and Fit Testing", agency: "DEPT OF ENERGY", naicsCode: "621999",
    description: "Annual respirator medical clearance questionnaires, evaluations and quantitative fit testing per OSHA 1910.134." },
  { id: "w-hearing", wanted: true, title: "Hearing Conservation Program Audiometric Testing", agency: "DEPT OF THE NAVY", naicsCode: "621340",
    description: "Baseline and annual audiograms for employees enrolled in the hearing conservation program." },
  { id: "w-ffd", wanted: true, title: "Fitness for Duty Medical Examinations for Law Enforcement Officers", agency: "DEPT OF HOMELAND SECURITY", naicsCode: "621111",
    description: "Periodic medical examinations and fitness-for-duty evaluations for armed law enforcement personnel." },
  { id: "w-surveillance", wanted: true, title: "Medical Surveillance Program for Hazardous Materials Workers", agency: "ENVIRONMENTAL PROTECTION AGENCY", naicsCode: "621999",
    description: "OSHA-required medical surveillance examinations for employees exposed to hazardous substances, including spirometry and biological monitoring." },
  { id: "w-network", wanted: true, title: "Nationwide Occupational Health Clinic Network Management", agency: "GENERAL SERVICES ADMINISTRATION", naicsCode: "541611",
    description: "Contractor shall manage a national network of occupational health clinics providing employee health examinations and testing." },
  { id: "w-wc-plus", wanted: true, title: "Employee Health Services including Pre-Placement Physicals and Workers' Compensation Case Support", agency: "STATE DEPARTMENT", naicsCode: "621111",
    description: "Pre-placement medical examinations, annual physicals and drug screening for employees; workers' compensation case support also required.",
    note: "Mentions workers' comp but the primary scope is in-scope services." },
  { id: "w-ime-employment", wanted: true, title: "Employment Fitness-for-Duty and Return-to-Work Independent Medical Evaluations", agency: "DEPT OF LABOR", naicsCode: "621111",
    description: "Independent medical evaluations to determine employee fitness for duty and return-to-work readiness." },

  // ── Unwanted: junk that has appeared in real results ─────────────────────
  { id: "u-fuel-kit", wanted: false, title: "W912CH-26-B-A002: TESTING KIT, AVIATION PETROLEUM (NSN 6630-01-558-5109)", agency: "DEPT OF THE ARMY", naicsCode: "334516",
    description: "Testing kit for aviation petroleum fuel contamination, national stock number 6630-01-558-5109." },
  { id: "u-nhtsa", wanted: false, title: "Traffic safety data analysis and crash reporting support services", agency: "NATIONAL HIGHWAY TRAFFIC SAFETY ADMINISTRATION", naicsCode: "541990",
    description: "Crash data analytics and reporting support for highway safety programs." },
  { id: "u-corrosion", wanted: false, title: "Corrosion Repair and Painting of Building 12 Exterior", agency: "DEPT OF THE NAVY", naicsCode: "238320",
    description: "Surface preparation, corrosion repair and repainting. Contractor shall comply with OSHA health and safety requirements and maintain a medical surveillance program for lead abatement workers." },
  { id: "u-it", wanted: false, title: "Enterprise IT Help Desk Support Services", agency: "DEPT OF COMMERCE", naicsCode: "541513",
    description: "Tier 1-3 help desk support. Personnel must pass a background check and drug test prior to starting." },
  { id: "u-lab-equipment", wanted: false, title: "Purchase of DNA Extraction System and EEG Equipment", agency: "NATIONAL INSTITUTES OF HEALTH", naicsCode: "334510",
    description: "Laboratory equipment purchase including DNA extraction instruments and EEG systems." },
  { id: "u-surveillance-camera", wanted: false, title: "Installation of Video Surveillance Cameras at Federal Building", agency: "GENERAL SERVICES ADMINISTRATION", naicsCode: "561621",
    description: "Supply and installation of security surveillance cameras and monitoring equipment." },
  { id: "u-staffing", wanted: false, title: "Clinical Staffing: Registered Nurses and Physicians for Medical Treatment Facility", agency: "DEFENSE HEALTH AGENCY", naicsCode: "621111",
    description: "Provide licensed nurses and physicians to deliver patient care at a military treatment facility.",
    note: "Treatment-only clinical staffing is out of scope." },
  { id: "u-wc-claims", wanted: false, title: "Workers' Compensation Claims Administration and Medical Cost Containment", agency: "DEPT OF LABOR", naicsCode: "524292",
    description: "Third-party administration of workers' compensation claims, bill review and medical case management." },
  { id: "u-pharma", wanted: false, title: "Pharmaceutical Supply: Influenza Vaccine Purchase", agency: "DEFENSE LOGISTICS AGENCY", naicsCode: "325414",
    description: "Purchase of influenza vaccine doses, delivered to depot." },
  { id: "u-construction", wanted: false, title: "Construction of Medical Clinic Annex", agency: "DEPT OF VETERANS AFFAIRS", naicsCode: "236220",
    description: "General construction of a new outpatient clinic annex." },
  { id: "u-award", wanted: false, title: "Award Notice: Occupational Health Services", agency: "DEPT OF THE ARMY", naicsCode: "621111",
    description: "Contract awarded to ABC Medical Corp for occupational health services. This is an award notice; no proposals are being accepted." },
  { id: "u-job", wanted: false, title: "Occupational Health Nurse - Full Time Position", agency: "Example County Government", naicsCode: "621111",
    description: "We are hiring a full-time occupational health nurse. Apply online. Benefits include health insurance and 401k." },
];
