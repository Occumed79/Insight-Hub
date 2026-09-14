export type SocrataDatasetClass =
  | "live_solicitations"
  | "upcoming_forecast"
  | "awards_intelligence"
  | "bid_tabulation"
  | "disabled";

export type SocrataCadence =
  | "daily"
  | "weekly"
  | "monthly"
  | "annual"
  | "unknown";

export interface SocrataFieldMap {
  id: string[];
  title: string[];
  description: string[];
  agency: string[];
  postedDate: string[];
  deadline: string[];
  status: string[];
  type: string[];
  sourceUrl: string[];
  value: string[];
  contactName: string[];
  contactEmail: string[];
}

export interface SocrataDatasetProfile {
  key: string;
  domain: string;
  datasetId: string;
  label: string;
  datasetClass: SocrataDatasetClass;
  enabled: boolean;
  priority: 0 | 1 | 2;
  expectedCadence: SocrataCadence;
  freshnessMaxAgeDays: number;
  fieldMap: SocrataFieldMap;
  openPredicate?: string;
  orderBy?: string;
  sourceUrlTemplate?: string;
  lastVerifiedAt: string;
  schemaFingerprint?: string;
}

export const DEFAULT_SOCRATA_FIELD_MAP: SocrataFieldMap = {
  id: ["request_id", "pin", "solicitation_number", "event", "number", "id", ":id"],
  title: ["short_title", "procurement_name", "services", "name", "title", "description"],
  description: [
    "additional_description_1",
    "additional_description_2",
    "additional_description_3",
    "other_info_1",
    "other_info_2",
    "other_info_3",
    "scope",
    "services",
    "description",
  ],
  agency: ["agency_name", "agency", "department", "buying_agency"],
  postedDate: ["start_date", "publish_date", "posted_date", "data_as_of_date"],
  deadline: ["due_date", "close_date", "response_due", "bid_due_date", "end_date"],
  status: ["status"],
  type: [
    "selection_method_description",
    "type_of_notice_description",
    "procurement_method",
    "type",
  ],
  sourceUrl: ["source_url", "url", "link", "solicitation_url"],
  value: [
    "contract_amount",
    "estimated_value",
    "not_to_exceed_award_amount_per_contract",
  ],
  contactName: ["contact_name"],
  contactEmail: ["email", "contact_email"],
};

function fieldMap(overrides: Partial<SocrataFieldMap> = {}): SocrataFieldMap {
  return {
    ...DEFAULT_SOCRATA_FIELD_MAP,
    ...overrides,
  };
}

/**
 * Curated production seed registry from the validated Socrata integration
 * working document. Dataset class is a routing boundary, not a relevance
 * whitelist: new buyers/services can still qualify from their row content.
 */
export const SOCRATA_DATASET_PROFILES: readonly SocrataDatasetProfile[] = [
  {
    key: "la-ramp-open-bids",
    domain: "data.lacity.org",
    datasetId: "hf3r-utnq",
    label: "Los Angeles - RAMP Open Bid Opportunities",
    datasetClass: "live_solicitations",
    enabled: true,
    priority: 0,
    expectedCadence: "weekly",
    freshnessMaxAgeDays: 14,
    fieldMap: fieldMap(),
    lastVerifiedAt: "2026-09-10",
  },
  {
    key: "sf-open-bid-opportunities",
    domain: "data.sf.gov",
    datasetId: "eshn-8t3a",
    label: "San Francisco - Open Bid Opportunities",
    datasetClass: "live_solicitations",
    enabled: true,
    priority: 0,
    expectedCadence: "weekly",
    freshnessMaxAgeDays: 14,
    fieldMap: fieldMap(),
    lastVerifiedAt: "2026-09-07",
  },
  {
    key: "montgomery-solicitations",
    domain: "data.montgomerycountymd.gov",
    datasetId: "eeq6-nnwe",
    label: "Montgomery County MD - Solicitations",
    datasetClass: "live_solicitations",
    enabled: true,
    priority: 0,
    expectedCadence: "daily",
    freshnessMaxAgeDays: 3,
    fieldMap: fieldMap({
      id: ["number", "solicitation_number", "id", ":id"],
      title: ["description", "title", "name"],
      type: ["type", "procurement_method"],
    }),
    openPredicate: "`status` = 'Active'",
    lastVerifiedAt: "2026-09-10",
  },
  {
    key: "nyc-current-rfp",
    domain: "data.cityofnewyork.us",
    datasetId: "bzjf-rmtp",
    label: "NYC - Current RFP",
    datasetClass: "live_solicitations",
    enabled: true,
    priority: 0,
    expectedCadence: "weekly",
    freshnessMaxAgeDays: 14,
    fieldMap: fieldMap({
      id: ["solicitation_number", "id", ":id"],
      title: ["services", "title", "description"],
      agency: ["department", "agency", "agency_name"],
      deadline: ["due_date", "close_date"],
      postedDate: ["data_as_of_date", "posted_date", "start_date"],
      value: ["not_to_exceed_award_amount_per_contract", "estimated_value"],
    }),
    orderBy: "`due_date` ASC",
    lastVerifiedAt: "2026-09-10",
  },
  {
    key: "nyc-current-bids",
    domain: "data.cityofnewyork.us",
    datasetId: "tf3b-tk9r",
    label: "NYC - Current NYC Bids",
    datasetClass: "live_solicitations",
    enabled: true,
    priority: 0,
    expectedCadence: "daily",
    freshnessMaxAgeDays: 3,
    fieldMap: fieldMap(),
    lastVerifiedAt: "2026-09-10",
  },
  {
    key: "nyc-cityrecview",
    domain: "data.cityofnewyork.us",
    datasetId: "sr3n-9r9v",
    label: "NYC - CityRecView",
    datasetClass: "live_solicitations",
    enabled: true,
    priority: 1,
    expectedCadence: "daily",
    freshnessMaxAgeDays: 3,
    fieldMap: fieldMap(),
    lastVerifiedAt: "2026-09-03",
  },
  {
    key: "nyc-anticipated-rfp",
    domain: "data.cityofnewyork.us",
    datasetId: "p8e4-uwuv",
    label: "NYC - Anticipated RFP",
    datasetClass: "upcoming_forecast",
    enabled: true,
    priority: 1,
    expectedCadence: "monthly",
    freshnessMaxAgeDays: 45,
    fieldMap: fieldMap(),
    lastVerifiedAt: "2026-09-10",
  },
  {
    key: "nyc-mwbe-upcoming",
    domain: "data.cityofnewyork.us",
    datasetId: "ww83-bcks",
    label: "NYC - M/WBE Upcoming Procurements",
    datasetClass: "upcoming_forecast",
    enabled: true,
    priority: 1,
    expectedCadence: "annual",
    freshnessMaxAgeDays: 365,
    fieldMap: fieldMap(),
    lastVerifiedAt: "2026-07-02",
  },
  {
    key: "cook-fy2026-buying-plan",
    domain: "datacatalog.cookcountyil.gov",
    datasetId: "cbhc-xvrm",
    label: "Cook County IL - FY2026 Buying Plan",
    datasetClass: "upcoming_forecast",
    enabled: true,
    priority: 1,
    expectedCadence: "annual",
    freshnessMaxAgeDays: 365,
    fieldMap: fieldMap(),
    lastVerifiedAt: "2026-09-10",
  },
  {
    key: "montgomery-award-solicitations",
    domain: "data.montgomerycountymd.gov",
    datasetId: "ku39-t2wt",
    label: "Montgomery County - Award Solicitations",
    datasetClass: "awards_intelligence",
    enabled: true,
    priority: 2,
    expectedCadence: "daily",
    freshnessMaxAgeDays: 3,
    fieldMap: fieldMap(),
    lastVerifiedAt: "2026-07-18",
  },
  {
    key: "little-rock-solicitations",
    domain: "data.littlerock.gov",
    datasetId: "w7xi-vkid",
    label: "Little Rock Solicitations",
    datasetClass: "disabled",
    enabled: false,
    priority: 2,
    expectedCadence: "unknown",
    freshnessMaxAgeDays: 45,
    fieldMap: fieldMap(),
    lastVerifiedAt: "2021-07-15",
  },
] as const;

export function enabledSocrataProfiles(
  datasetClass?: SocrataDatasetClass,
): SocrataDatasetProfile[] {
  return SOCRATA_DATASET_PROFILES.filter(
    (profile) => profile.enabled && (!datasetClass || profile.datasetClass === datasetClass),
  );
}
