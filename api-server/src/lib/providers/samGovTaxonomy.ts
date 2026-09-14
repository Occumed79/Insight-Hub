export type SamGovTaxonomyTier =
  | "registered"
  | "capability"
  | "classification-drift"
  | "secondary-adjacent";

export interface SamGovTaxonomyEntry {
  code: string;
  title: string;
  tier: SamGovTaxonomyTier;
  rationale: string;
}

export interface SamGovClassificationQuery {
  parameter: "ncode" | "ccode";
  code: string;
  title: string;
  tier: SamGovTaxonomyTier;
  /**
   * Classification history and the SAM entity profile are positive discovery
   * evidence only. They must never become a whitelist or a negative filter.
   */
  effect: "include";
}

const NAICS: readonly SamGovTaxonomyEntry[] = [
  // Current OCCU-MED, LTD. SAM entity-profile NAICS.
  {
    code: "541612",
    title: "Human Resources Consulting Services",
    tier: "registered",
    rationale: "Current primary SAM entity-profile NAICS.",
  },
  {
    code: "541611",
    title: "Administrative Management and General Management Consulting Services",
    tier: "registered",
    rationale: "Current SAM entity-profile NAICS used for management and program support.",
  },
  {
    code: "541614",
    title: "Process, Physical Distribution, and Logistics Consulting Services",
    tier: "registered",
    rationale: "Current SAM entity-profile NAICS relevant to coordinated multi-location service delivery.",
  },
  {
    code: "621111",
    title: "Offices of Physicians (Except Mental Health Specialists)",
    tier: "registered",
    rationale: "Current SAM entity-profile NAICS directly covering physician medical services.",
  },
  {
    code: "621498",
    title: "All Other Outpatient Care Centers",
    tier: "registered",
    rationale: "Current SAM entity-profile NAICS covering outpatient occupational-health delivery.",
  },
  {
    code: "621999",
    title: "All Other Miscellaneous Ambulatory Health Care Services",
    tier: "registered",
    rationale: "Current SAM entity-profile NAICS covering broad ambulatory medical services.",
  },
  {
    code: "923120",
    title: "Administration of Public Health Programs",
    tier: "registered",
    rationale: "Current SAM entity-profile NAICS relevant to public-health program administration.",
  },

  // Additional capability-aligned codes that can classify work Occu-Med performs
  // or coordinates even though they are not displayed on the current entity profile.
  {
    code: "621210",
    title: "Offices of Dentists",
    tier: "capability",
    rationale: "Dental examinations and evaluations are recurring Occu-Med coordinated services.",
  },
  {
    code: "621320",
    title: "Offices of Optometrists",
    tier: "capability",
    rationale: "Vision examinations and optometry can appear inside occupational medical requirements.",
  },
  {
    code: "621330",
    title: "Offices of Mental Health Practitioners (Except Physicians)",
    tier: "capability",
    rationale: "Behavioral and psychological evaluations can be components of occupational or public-safety examinations.",
  },
  {
    code: "621340",
    title: "Offices of Physical, Occupational and Speech Therapists, and Audiologists",
    tier: "capability",
    rationale: "Explicitly captures audiology and hearing-conservation work.",
  },
  {
    code: "621399",
    title: "Offices of All Other Miscellaneous Health Practitioners",
    tier: "capability",
    rationale: "Federal medical-support, fitness-for-duty, and testing procurements can be classified under this catch-all practitioner code.",
  },
  {
    code: "621511",
    title: "Medical Laboratories",
    tier: "capability",
    rationale: "Covers laboratory testing, blood work, and related medical testing requirements.",
  },
  {
    code: "621512",
    title: "Diagnostic Imaging Centers",
    tier: "capability",
    rationale: "Covers chest X-ray and other diagnostic imaging components coordinated by Occu-Med.",
  },
  {
    code: "541618",
    title: "Other Management Consulting Services",
    tier: "capability",
    rationale: "Captures health-program and management-support acquisitions that are structured as consulting services.",
  },
  {
    code: "541690",
    title: "Other Scientific and Technical Consulting Services",
    tier: "capability",
    rationale: "Includes safety and technical consulting that can overlap occupational-health programs.",
  },
  {
    code: "541990",
    title: "All Other Professional, Scientific, and Technical Services",
    tier: "capability",
    rationale: "Broad professional-services classification sometimes used for medical and program support.",
  },

  // Classification-drift codes are deliberately searched because federal buyers
  // sometimes place occupational-health work under broader facility/provider codes.
  {
    code: "622110",
    title: "General Medical and Surgical Hospitals",
    tier: "classification-drift",
    rationale: "Relevant occupational-health procurements have been classified under hospital services despite narrower underlying scope.",
  },
  {
    code: "541620",
    title: "Environmental Consulting Services",
    tier: "classification-drift",
    rationale: "Secondary lane for occupational/environmental-health and industrial-hygiene acquisitions.",
  },
] as const;

const PSC: readonly SamGovTaxonomyEntry[] = [
  // Current OCCU-MED, LTD. SAM entity-profile PSCs.
  {
    code: "Q403",
    title: "Medical - Evaluation/Screening",
    tier: "registered",
    rationale: "Current SAM entity-profile PSC and core occupational exam classification.",
  },
  {
    code: "Q999",
    title: "Medical - Other",
    tier: "registered",
    rationale: "Current SAM entity-profile medical catch-all PSC.",
  },

  // Medical capability PSCs that can classify services Occu-Med performs or coordinates.
  {
    code: "Q301",
    title: "Medical - Reference Laboratory Testing",
    tier: "capability",
    rationale: "Captures clinical laboratory and drug-testing requirements.",
  },
  {
    code: "Q401",
    title: "Medical - Nursing",
    tier: "capability",
    rationale: "Relevant when examinations or clinical services are purchased through nursing personnel.",
  },
  {
    code: "Q502",
    title: "Medical - Cardiology",
    tier: "capability",
    rationale: "Captures ECG, treadmill stress testing, and cardiology referral components.",
  },
  {
    code: "Q503",
    title: "Medical - Dentistry",
    tier: "capability",
    rationale: "Directly covers dental examinations and evaluations.",
  },
  {
    code: "Q509",
    title: "Medical - Family and Internal Medicine",
    tier: "capability",
    rationale: "Captures preventive, primary-care, and physician examination requirements.",
  },
  {
    code: "Q511",
    title: "Medical - Ophthalmology and Optometry",
    tier: "capability",
    rationale: "Captures occupational vision and eye-examination requirements.",
  },
  {
    code: "Q514",
    title: "Medical - Otolaryngology",
    tier: "capability",
    rationale: "Current PSC family includes audiology and hearing-related professional services.",
  },
  {
    code: "Q515",
    title: "Medical - Pathology",
    tier: "capability",
    rationale: "Captures phlebotomy and laboratory technical services.",
  },
  {
    code: "Q517",
    title: "Medical - Pharmacy Services",
    tier: "capability",
    rationale: "Secondary medical lane for pharmacist-delivered vaccination and related services.",
  },
  {
    code: "Q519",
    title: "Medical - Behavioral and Mental Health",
    tier: "capability",
    rationale: "Captures psychiatric and behavioral-health evaluations used in some occupational programs.",
  },
  {
    code: "Q521",
    title: "Medical - Pulmonary",
    tier: "capability",
    rationale: "Captures pulmonary and respiratory services related to surveillance and respirator programs.",
  },
  {
    code: "Q522",
    title: "Medical - Radiology",
    tier: "capability",
    rationale: "Captures X-ray, ultrasound, CT, MRI, and radiology technical services.",
  },
  {
    code: "Q533",
    title: "Occupational & Public Health Services",
    tier: "capability",
    rationale: "Direct occupational/public-health classification and a critical discovery lane for Occu-Med.",
  },
  {
    code: "Q701",
    title: "Specialized Medical Support",
    tier: "capability",
    rationale: "Captures referral management, medical quality, evaluation-board, credentialing, and health-risk support functions.",
  },
  {
    code: "Q702",
    title: "Technical Medical Support",
    tier: "capability",
    rationale: "Captures medical readiness, logistics, and technical support programs adjacent to deployment medical work.",
  },
  {
    code: "Q801",
    title: "Medical Appointing Services",
    tier: "capability",
    rationale: "Captures medical appointment and scheduling coordination.",
  },

  // Broader professional-support classifications are secondary signals only.
  {
    code: "R408",
    title: "Program Management/Support Services",
    tier: "secondary-adjacent",
    rationale: "Useful when a medical program is acquired primarily as program-management support.",
  },
  {
    code: "R410",
    title: "Program Evaluation/Review/Development Services",
    tier: "secondary-adjacent",
    rationale: "Useful for occupational-health program evaluation and development work.",
  },
  {
    code: "R428",
    title: "Industrial Hygienics",
    tier: "secondary-adjacent",
    rationale: "Captures industrial-hygiene acquisitions adjacent to occupational-health surveillance.",
  },
  {
    code: "R431",
    title: "Human Resources Services",
    tier: "secondary-adjacent",
    rationale: "Secondary signal for employee-health programs acquired under HR-support classifications.",
  },
  {
    code: "R499",
    title: "Other Professional Support Services",
    tier: "secondary-adjacent",
    rationale: "Broad support-services catch-all used as a discovery signal only.",
  },
] as const;

export const SAM_GOV_DISCOVERY_TAXONOMY = {
  naics: NAICS,
  psc: PSC,
} as const;

/**
 * Return every known positive SAM discovery classification. This intentionally
 * does not expose a reject list: an opportunity using an unlisted code remains
 * eligible for discovery and semantic reasoning through the other search lanes.
 */
export function buildSamGovClassificationQueries(): SamGovClassificationQuery[] {
  return [
    ...NAICS.map((entry) => ({
      parameter: "ncode" as const,
      code: entry.code,
      title: entry.title,
      tier: entry.tier,
      effect: "include" as const,
    })),
    ...PSC.map((entry) => ({
      parameter: "ccode" as const,
      code: entry.code,
      title: entry.title,
      tier: entry.tier,
      effect: "include" as const,
    })),
  ];
}
