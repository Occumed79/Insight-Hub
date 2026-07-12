import {
  DIRECT_RFP_PORTALS,
  type DirectRfpPortal,
} from "./directRfpPortals";
import type { PortalFit } from "./portalRelevance";

export type DirectRfpPortalBuyerSector =
  | "federal_government"
  | "state_government"
  | "county_government"
  | "municipal_government"
  | "defense"
  | "law_enforcement"
  | "fire_rescue"
  | "emergency_medical_services"
  | "corrections"
  | "juvenile_justice"
  | "transportation_department"
  | "transit_authority"
  | "airport_authority"
  | "port_authority"
  | "water_wastewater_utility"
  | "electric_energy_utility"
  | "public_works"
  | "environmental_hazmat"
  | "emergency_management"
  | "public_university"
  | "community_college"
  | "school_district"
  | "housing_authority"
  | "hospital_district"
  | "public_health"
  | "regional_authority"
  | "special_district"
  | "international_government"
  | "multilateral_organization"
  | "general_procurement";

export type PortalRelevanceReviewMethod =
  | "official_relevant_solicitation"
  | "official_procurement_forecast"
  | "official_contract_history"
  | "official_buyer_propensity"
  | "official_broad_portal"
  | "insufficient_access"
  | "not_a_direct_procurement_source";

export interface DirectRfpPortalRelevanceRecord {
  portalId: string;
  occumedFit: PortalFit;
  buyerSector: DirectRfpPortalBuyerSector;
  occumedServiceCategories: string[];
  relevanceReasonCodes: string[];
  relevanceEvidence: string[];
  relevanceEvidenceUrls: string[];
  lastRelevanceVerified: string;
  reviewMethod: PortalRelevanceReviewMethod;
}

export type EnrichedDirectRfpPortal = Omit<
  DirectRfpPortal,
  | "occumedFit"
  | "occumedServiceCategories"
  | "relevanceReasonCodes"
  | "relevanceEvidence"
  | "relevanceEvidenceUrls"
  | "lastRelevanceVerified"
  | "buyerSector"
> &
  Omit<DirectRfpPortalRelevanceRecord, "portalId" | "reviewMethod"> & {
    reviewMethod: PortalRelevanceReviewMethod;
  };

const VERIFIED_DATE = "2026-07-12";

const VERIFIED_OFFICIAL_EVIDENCE: Record<
  string,
  Omit<DirectRfpPortalRelevanceRecord, "portalId" | "lastRelevanceVerified">
> = {
  "us-sam-gov": {
    occumedFit: "verified_high",
    buyerSector: "federal_government",
    occumedServiceCategories: [
      "Occupational / Employee Medical Services",
      "Deployment / Military / Overseas Medical Readiness",
      "Provider Network / Program Management / Reporting",
    ],
    relevanceReasonCodes: ["portal_verified"],
    relevanceEvidence: [
      "SAM.gov has published official federal opportunities for Local Nationals Occupational Health Examinations and Federal Occupational Health clinical support.",
    ],
    relevanceEvidenceUrls: [
      "https://sam.gov/workspace/contract/opp/a615c23e92634088860158662cd013bc/view",
      "https://sam.gov/opp/e5ba37aa8d3646c6b1f7694c848ac551/view",
    ],
    reviewMethod: "official_relevant_solicitation",
  },
  "or-oregonbuys": {
    occumedFit: "verified_high",
    buyerSector: "state_government",
    occumedServiceCategories: [
      "Respiratory Protection / Fit Testing",
      "Medical Surveillance / Exposure Programs",
    ],
    relevanceReasonCodes: ["portal_verified"],
    relevanceEvidence: [
      "OregonBuys hosted an official Oregon solicitation for a respirator fit-testing system, demonstrating relevant respiratory-protection procurement activity.",
    ],
    relevanceEvidenceUrls: [
      "https://oregonbuys.gov/bso/external/bidDetail.sdo?docId=S-44000-00017081&external=true&parentUrl=close",
    ],
    reviewMethod: "official_relevant_solicitation",
  },
  "nc-evp": {
    occumedFit: "verified_high",
    buyerSector: "state_government",
    occumedServiceCategories: [
      "Pre-Employment / Post-Offer / Pre-Placement Examinations",
      "Drug / Alcohol Testing and Program Administration",
      "Laboratory / Diagnostic / Exam Components",
      "Medical Suitability / Job Compatibility / Exam Review",
    ],
    relevanceReasonCodes: ["portal_verified"],
    relevanceEvidence: [
      "North Carolina eVP published an official Department of Public Safety RFQ for pre-employment physicals, drug testing, TB testing, essential-job-function review, and medical suitability determinations.",
    ],
    relevanceEvidenceUrls: [
      "https://evp.nc.gov/_entity/annotation/09941dce-e425-f011-998a-001dd80c2969/863ea987-6d3e-ed11-9daf-001dd805ec0b?t=1746055840853",
    ],
    reviewMethod: "official_relevant_solicitation",
  },
  "ma-commbuys": {
    occumedFit: "verified_high",
    buyerSector: "state_government",
    occumedServiceCategories: [
      "Occupational / Employee Medical Services",
      "Pre-Employment / Post-Offer / Pre-Placement Examinations",
      "Medical Surveillance / Exposure Programs",
    ],
    relevanceReasonCodes: ["portal_verified"],
    relevanceEvidence: [
      "COMMBUYS hosted an official Employee Occupational Health Services solicitation for employee physicals, pre-placement examinations, clinical testing, fitness-for-duty review, and medical surveillance.",
    ],
    relevanceEvidenceUrls: [
      "https://www.commbuys.com/bso/external/bidDetail.sda?docId=BD-26-1053-1053C-CSR-129753&external=true&parentUrl=close",
    ],
    reviewMethod: "official_relevant_solicitation",
  },
};

const HIGH_PROPENSITY_SECTORS = new Set<DirectRfpPortalBuyerSector>([
  "defense",
  "law_enforcement",
  "fire_rescue",
  "emergency_medical_services",
  "corrections",
  "juvenile_justice",
  "transportation_department",
  "transit_authority",
  "airport_authority",
  "port_authority",
  "water_wastewater_utility",
  "electric_energy_utility",
  "public_works",
  "environmental_hazmat",
  "emergency_management",
  "public_health",
]);

const SERVICE_CATEGORIES_BY_SECTOR: Partial<
  Record<DirectRfpPortalBuyerSector, string[]>
> = {
  defense: [
    "Deployment / Military / Overseas Medical Readiness",
    "Occupational / Employee Medical Services",
    "Provider Network / Program Management / Reporting",
  ],
  law_enforcement: [
    "Public-Safety Medical Services",
    "Pre-Employment / Post-Offer / Pre-Placement Examinations",
    "Fitness-for-Duty / Return-to-Work / Work Capacity",
    "Drug / Alcohol Testing and Program Administration",
  ],
  fire_rescue: [
    "Public-Safety Medical Services",
    "Medical Surveillance / Exposure Programs",
    "Respiratory Protection / Fit Testing",
    "Hearing Conservation / Audiometry",
  ],
  emergency_medical_services: [
    "Public-Safety Medical Services",
    "Occupational / Employee Medical Services",
    "Immunizations / Travel Health",
  ],
  corrections: [
    "Public-Safety Medical Services",
    "Pre-Employment / Post-Offer / Pre-Placement Examinations",
    "Drug / Alcohol Testing and Program Administration",
  ],
  juvenile_justice: [
    "Pre-Employment / Post-Offer / Pre-Placement Examinations",
    "Drug / Alcohol Testing and Program Administration",
    "Medical Suitability / Job Compatibility / Exam Review",
  ],
  transportation_department: [
    "Drug / Alcohol Testing and Program Administration",
    "Public-Safety Medical Services",
    "Medical Surveillance / Exposure Programs",
  ],
  transit_authority: [
    "Drug / Alcohol Testing and Program Administration",
    "Public-Safety Medical Services",
    "Fitness-for-Duty / Return-to-Work / Work Capacity",
  ],
  airport_authority: [
    "Drug / Alcohol Testing and Program Administration",
    "Medical Surveillance / Exposure Programs",
    "Respiratory Protection / Fit Testing",
  ],
  port_authority: [
    "Drug / Alcohol Testing and Program Administration",
    "Medical Surveillance / Exposure Programs",
    "Respiratory Protection / Fit Testing",
    "Hearing Conservation / Audiometry",
  ],
  water_wastewater_utility: [
    "Medical Surveillance / Exposure Programs",
    "Respiratory Protection / Fit Testing",
    "Hearing Conservation / Audiometry",
  ],
  electric_energy_utility: [
    "Medical Surveillance / Exposure Programs",
    "Respiratory Protection / Fit Testing",
    "Hearing Conservation / Audiometry",
  ],
  public_works: [
    "Medical Surveillance / Exposure Programs",
    "Respiratory Protection / Fit Testing",
    "Drug / Alcohol Testing and Program Administration",
  ],
  environmental_hazmat: [
    "Medical Surveillance / Exposure Programs",
    "Respiratory Protection / Fit Testing",
    "Laboratory / Diagnostic / Exam Components",
  ],
  emergency_management: [
    "Public-Safety Medical Services",
    "Respiratory Protection / Fit Testing",
    "Immunizations / Travel Health",
  ],
  public_health: [
    "Occupational / Employee Medical Services",
    "Immunizations / Travel Health",
    "Laboratory / Diagnostic / Exam Components",
  ],
};

function normalizedPortalText(portal: DirectRfpPortal): string {
  return `${portal.id} ${portal.name} ${portal.jurisdiction} ${portal.notes}`.toLowerCase();
}

export function inferPortalBuyerSector(
  portal: DirectRfpPortal,
): DirectRfpPortalBuyerSector {
  const text = normalizedPortalText(portal);
  if (portal.country !== "US") {
    return /world bank|multilateral/.test(text)
      ? "multilateral_organization"
      : "international_government";
  }
  if (portal.level === "federal") return "federal_government";
  if (/defense|military|army|navy|air force|marine corps|dod\b/.test(text))
    return "defense";
  if (/juvenile justice/.test(text)) return "juvenile_justice";
  if (/correction|prison|detention/.test(text)) return "corrections";
  if (/police|sheriff|law enforcement|public safety/.test(text))
    return "law_enforcement";
  if (/fire authority|fire district|fire department|fire rescue/.test(text))
    return "fire_rescue";
  if (/\bems\b|emergency medical/.test(text))
    return "emergency_medical_services";
  if (/airport|aviation authority/.test(text)) return "airport_authority";
  if (/port authority|port of |seaport|harbor/.test(text))
    return "port_authority";
  if (/transit|metro |transportation authority|regional transportation/.test(text))
    return "transit_authority";
  if (/department of transportation|\bdot\b/.test(text))
    return "transportation_department";
  if (/water|wastewater|sewer|sanitation district/.test(text))
    return "water_wastewater_utility";
  if (/electric|energy|power utility|municipal utility|utility authority/.test(text))
    return "electric_energy_utility";
  if (/public works/.test(text)) return "public_works";
  if (/hazmat|hazardous|environmental protection/.test(text))
    return "environmental_hazmat";
  if (/emergency management/.test(text)) return "emergency_management";
  if (/public health|health department/.test(text)) return "public_health";
  if (/hospital|medical center|health system/.test(text))
    return "hospital_district";
  if (/community college/.test(text)) return "community_college";
  if (/university|college|\buc\b|ucla|ucsf|ucsd/.test(text))
    return "public_university";
  if (/school district|public schools|board of education/.test(text))
    return "school_district";
  if (/housing authority/.test(text)) return "housing_authority";
  if (/county/.test(text)) return "county_government";
  if (/city of |town of |village of |borough|municipal/.test(text))
    return "municipal_government";
  if (/regional|metropolitan council/.test(text)) return "regional_authority";
  if (/district|authority/.test(text)) return "special_district";
  if (portal.level === "state") return "state_government";
  return "general_procurement";
}

function buildBaselineRecord(
  portal: DirectRfpPortal,
): DirectRfpPortalRelevanceRecord {
  const verified = VERIFIED_OFFICIAL_EVIDENCE[portal.id];
  if (verified) {
    return {
      portalId: portal.id,
      ...verified,
      lastRelevanceVerified: VERIFIED_DATE,
    };
  }

  const buyerSector = inferPortalBuyerSector(portal);
  const officialEvidenceUrl = portal.searchUrl || portal.url;
  const likely = HIGH_PROPENSITY_SECTORS.has(buyerSector);
  const hasOfficialEvidence = Boolean(
    officialEvidenceUrl &&
      portal.domain &&
      /official|procurement|purchasing|bid|solicitation|contract|vendor|opportunit/i.test(
        `${portal.name} ${portal.notes}`,
      ),
  );

  if (likely && hasOfficialEvidence) {
    return {
      portalId: portal.id,
      occumedFit: "likely",
      buyerSector,
      occumedServiceCategories: SERVICE_CATEGORIES_BY_SECTOR[buyerSector] ?? [],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        `${portal.name} is an official ${buyerSector.replaceAll("_", " ")} procurement source. That buyer population has recurring occupational-medical, safety-sensitive, exposure-surveillance, public-safety, or regulated-testing needs; no direct matching solicitation was claimed during this baseline review.`,
      ],
      relevanceEvidenceUrls: [officialEvidenceUrl],
      lastRelevanceVerified: VERIFIED_DATE,
      reviewMethod: "official_buyer_propensity",
    };
  }

  if (hasOfficialEvidence) {
    return {
      portalId: portal.id,
      occumedFit: "broad",
      buyerSector,
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        `${portal.name} is confirmed by its catalog record and official URL as a broad public procurement source, but this baseline review did not claim direct Occu-Med-specific procurement evidence.`,
      ],
      relevanceEvidenceUrls: [officialEvidenceUrl],
      lastRelevanceVerified: VERIFIED_DATE,
      reviewMethod: "official_broad_portal",
    };
  }

  return {
    portalId: portal.id,
    occumedFit: "insufficient_evidence",
    buyerSector,
    occumedServiceCategories: [],
    relevanceReasonCodes: ["portal_insufficient_evidence"],
    relevanceEvidence: [
      `${portal.name} remains in the direct catalog, but its current metadata did not provide enough public procurement evidence for a stronger Occu-Med fit classification.`,
    ],
    relevanceEvidenceUrls: officialEvidenceUrl ? [officialEvidenceUrl] : [],
    lastRelevanceVerified: VERIFIED_DATE,
    reviewMethod: "insufficient_access",
  };
}

export const DIRECT_RFP_PORTAL_RELEVANCE_RECORDS: DirectRfpPortalRelevanceRecord[] =
  DIRECT_RFP_PORTALS.map(buildBaselineRecord).sort((a, b) =>
    a.portalId.localeCompare(b.portalId),
  );

export const DIRECT_RFP_PORTAL_RELEVANCE_BY_ID = new Map(
  DIRECT_RFP_PORTAL_RELEVANCE_RECORDS.map((record) => [record.portalId, record]),
);

export const ENRICHED_DIRECT_RFP_PORTALS: EnrichedDirectRfpPortal[] =
  DIRECT_RFP_PORTALS.map((portal) => {
    const record = DIRECT_RFP_PORTAL_RELEVANCE_BY_ID.get(portal.id);
    if (!record) {
      throw new Error(`Missing Occu-Med relevance record for ${portal.id}`);
    }
    const { portalId: _portalId, ...metadata } = record;
    return { ...portal, ...metadata };
  });

const FIT_ORDER: Record<PortalFit | "unclassified", number> = {
  verified_high: 0,
  likely: 1,
  broad: 2,
  insufficient_evidence: 3,
  irrelevant: 5,
  unclassified: 4,
};

export function enrichedDirectRfpPortalsForOccuMedSearch(
  options: {
    includeTier3?: boolean;
    minimumFit?: Exclude<PortalFit, "irrelevant">;
    includeIrrelevant?: boolean;
  } = {},
): EnrichedDirectRfpPortal[] {
  const minimum = options.minimumFit
    ? FIT_ORDER[options.minimumFit]
    : null;
  return ENRICHED_DIRECT_RFP_PORTALS.filter(
    (portal) =>
      portal.level !== "federal" &&
      (options.includeTier3 ?? true || portal.tier !== 3) &&
      (options.includeIrrelevant || portal.occumedFit !== "irrelevant") &&
      (minimum == null || FIT_ORDER[portal.occumedFit] <= minimum),
  ).sort(
    (a, b) =>
      FIT_ORDER[a.occumedFit] - FIT_ORDER[b.occumedFit] ||
      a.tier - b.tier ||
      a.name.localeCompare(b.name),
  );
}

const BLOCKED_EVIDENCE_DOMAINS = [
  "bidnet",
  "demandstar",
  "highergov",
  "govtribe",
  "starbridge",
  "rfpmart",
  "bidbanana",
  "sweetspot",
  "fedscout",
  "govwin",
  "planetbids",
  "opengov",
  "periscope",
  "s2g",
  "google.",
  "bing.",
];

export interface PortalRelevanceCatalogValidation {
  totalPortals: number;
  totalRecords: number;
  missingPortalIds: string[];
  unknownPortalIds: string[];
  duplicatePortalIds: string[];
  invalidRecords: string[];
  blockedEvidenceUrls: string[];
}

export function validateDirectRfpPortalRelevanceCatalog(): PortalRelevanceCatalogValidation {
  const portalIds = new Set(DIRECT_RFP_PORTALS.map((portal) => portal.id));
  const counts = new Map<string, number>();
  const invalidRecords: string[] = [];
  const blockedEvidenceUrls: string[] = [];

  for (const record of DIRECT_RFP_PORTAL_RELEVANCE_RECORDS) {
    counts.set(record.portalId, (counts.get(record.portalId) ?? 0) + 1);
    const evidenceText = record.relevanceEvidence.join(" ").trim();
    const urls = record.relevanceEvidenceUrls;
    if (!record.lastRelevanceVerified.match(/^\d{4}-\d{2}-\d{2}$/))
      invalidRecords.push(`${record.portalId}:invalid-date`);
    if (!record.buyerSector)
      invalidRecords.push(`${record.portalId}:missing-buyer-sector`);
    if (!evidenceText)
      invalidRecords.push(`${record.portalId}:missing-evidence-statement`);
    if (record.occumedFit === "verified_high") {
      if (urls.length === 0)
        invalidRecords.push(`${record.portalId}:verified-without-url`);
      if (record.occumedServiceCategories.length === 0)
        invalidRecords.push(`${record.portalId}:verified-without-category`);
    }
    if (record.occumedFit === "likely") {
      if (urls.length === 0)
        invalidRecords.push(`${record.portalId}:likely-without-url`);
      if (record.occumedServiceCategories.length === 0)
        invalidRecords.push(`${record.portalId}:likely-without-category`);
    }
    if (record.occumedFit === "broad" && urls.length === 0)
      invalidRecords.push(`${record.portalId}:broad-without-official-url`);
    for (const url of urls) {
      const lower = url.toLowerCase();
      if (BLOCKED_EVIDENCE_DOMAINS.some((domain) => lower.includes(domain)))
        blockedEvidenceUrls.push(`${record.portalId}:${url}`);
    }
  }

  return {
    totalPortals: DIRECT_RFP_PORTALS.length,
    totalRecords: DIRECT_RFP_PORTAL_RELEVANCE_RECORDS.length,
    missingPortalIds: [...portalIds].filter((id) => !counts.has(id)),
    unknownPortalIds: [...counts.keys()].filter((id) => !portalIds.has(id)),
    duplicatePortalIds: [...counts.entries()]
      .filter(([, count]) => count > 1)
      .map(([id]) => id),
    invalidRecords,
    blockedEvidenceUrls,
  };
}
