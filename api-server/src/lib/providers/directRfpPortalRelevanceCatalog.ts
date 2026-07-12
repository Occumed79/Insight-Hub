import { DIRECT_RFP_PORTALS, type DirectRfpPortal } from "./directRfpPortals";
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
> & {
  occumedFit: PortalFit;
  buyerSector: DirectRfpPortalBuyerSector;
  occumedServiceCategories: string[];
  relevanceReasonCodes: string[];
  relevanceEvidence: string[];
  relevanceEvidenceUrls: string[];
  lastRelevanceVerified: string;
  reviewMethod: PortalRelevanceReviewMethod;
};

export const DIRECT_RFP_PORTAL_RELEVANCE_RECORDS: DirectRfpPortalRelevanceRecord[] =
  [
    {
      portalId: "ak-anchorage",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Municipality of Anchorage Purchasing is an official direct procurement source for Municipality of Anchorage, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.muni.org/Departments/purchasing/Pages/default.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ak-fairbanks-north-star-borough",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Fairbanks North Star Borough Purchasing is an official direct procurement source for Fairbanks North Star Borough, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.fnsb.gov/452/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ak-university-of-alaska",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University of Alaska Procurement is an official direct procurement source for University of Alaska, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.alaska.edu/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ak-vss",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Alaska Vendor Self Service is an official direct procurement source for Alaska, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://vss.alaska.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "al-birmingham",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Birmingham Purchasing is an official direct procurement source for City of Birmingham, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.birminghamal.gov/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "al-jefferson-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Jefferson County Purchasing is an official direct procurement source for Jefferson County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.jccal.org/Default.asp?ID=238&pg=Purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "al-mobile-county-public-schools",
      occumedFit: "broad",
      buyerSector: "school_district",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Mobile County Public Schools Purchasing is an official direct procurement source for Mobile County Public Schools, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.mcpss.com/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "al-staars",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Alabama STAARS Vendor Self Service is an official direct procurement source for Alabama, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.staars.alabama.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ar-arbuy",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Arkansas ARBuy is an official direct procurement source for Arkansas, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://arbuy.arkansas.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ar-fayetteville",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Fayetteville Purchasing is an official direct procurement source for City of Fayetteville, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.fayetteville-ar.gov/384/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ar-little-rock",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Little Rock Purchasing is an official direct procurement source for City of Little Rock, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.littlerock.gov/city-administration/city-departments/finance/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "az-app",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Arizona Procurement Portal is an official direct procurement source for Arizona, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://appstate.az.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "az-chandler",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Chandler Purchasing is an official direct procurement source for City of Chandler, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.chandleraz.gov/government/departments/management-services/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "az-maricopa-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Maricopa County Procurement Services is an official direct procurement source for Maricopa County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.maricopa.gov/2085/Procurement-Services",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "az-mesa",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Mesa Purchasing is an official direct procurement source for City of Mesa, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.mesaaz.gov/business/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "az-phoenix",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Phoenix Finance Procurement is an official direct procurement source for City of Phoenix, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.phoenix.gov/finance/vendorsreg"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "az-pima-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Pima County Procurement is an official direct procurement source for Pima County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.pima.gov/711/Procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "az-tucson",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Tucson Procurement is an official direct procurement source for City of Tucson, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.tucsonprocurement.com/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "az-valley-metro",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Valley Metro Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.valleymetro.org/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-alameda-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Alameda County General Services Agency Procurement is an official direct procurement source for Alameda County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://gsa.acgov.org/do-business-with-us/contracting-opportunities/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-anaheim",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Anaheim Purchasing is an official direct procurement source for City of Anaheim, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.anaheim.net/140/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-anaheim-purchasing",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Anaheim Purchasing is an official direct procurement source for City of Anaheim, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.anaheim.net/261/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-bakersfield-purchasing",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Bakersfield Purchasing is an official direct procurement source for City of Bakersfield, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.bakersfieldcity.us/518/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-bart",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "BART Procurement Opportunities is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.bart.gov/about/business/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-berkeley",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Berkeley Procurement is an official direct procurement source for City of Berkeley, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://berkeleyca.gov/doing-business/doing-business-city/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-burbank",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Burbank Purchasing is an official direct procurement source for City of Burbank, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.burbankca.gov/web/financial-services/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-caleprocure",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "California Cal eProcure is an official direct procurement source for California, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://caleprocure.ca.gov/pages/Events-BS3/event-search.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-calpoly-procurement",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Cal Poly Procurement Services is an official direct procurement source for Cal Poly San Luis Obispo, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://afd.calpoly.edu/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-canadabuys",
      occumedFit: "broad",
      buyerSector: "international_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "CanadaBuys Tender Opportunities is an official direct procurement source for Canada, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://canadabuys.canada.ca/en/tender-opportunities",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-city-of-long-beach",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Long Beach Purchasing is an official direct procurement source for City of Long Beach, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://longbeach.gov/finance/business-info/purchasing-division/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-city-of-los-angeles",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Los Angeles RAMPLA Contract Opportunities is an official direct procurement source for City of Los Angeles, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.rampla.org/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-contra-costa-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Contra Costa County Purchasing is an official direct procurement source for Contra Costa County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.contracosta.ca.gov/4786/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-csu",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "California State University Contract Services and Procurement is an official direct procurement source for California State University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.calstate.edu/csu-system/doing-business-with-the-csu/contract-services-and-procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-csuf-procurement",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Cal State Fullerton Procurement is an official direct procurement source for Cal State Fullerton, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://finance.fullerton.edu/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-csulb-procurement",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Cal State Long Beach Procurement Services is an official direct procurement source for Cal State Long Beach, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.csulb.edu/financial-management/procurement-services",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-csun-procurement",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Cal State Northridge Purchasing and Contract Administration is an official direct procurement source for Cal State Northridge, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.csun.edu/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-east-bay-mud",
      occumedFit: "likely",
      buyerSector: "electric_energy_utility",
      occumedServiceCategories: [
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "East Bay Municipal Utility District Purchasing is an official electric energy utility procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.ebmud.com/business-center/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-fremont-purchasing",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Fremont Purchasing is an official direct procurement source for City of Fremont, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.fremont.gov/government/departments/finance/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-fresno",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Fresno Purchasing is an official direct procurement source for City of Fresno, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.fresno.gov/finance/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-fresno-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Fresno County Purchasing is an official direct procurement source for Fresno County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.fresnocountyca.gov/Departments/General-Services/Purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-fresnostate-procurement",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Fresno State Procurement is an official direct procurement source for Fresno State, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://adminfinance.fresnostate.edu/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-glendale",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Glendale Purchasing is an official direct procurement source for City of Glendale, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.glendaleca.gov/government/departments/finance/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-irvine",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Irvine Purchasing is an official direct procurement source for City of Irvine, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.cityofirvine.org/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-kern-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Kern County Purchasing is an official direct procurement source for Kern County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.kerncounty.com/government/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-la-metro",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "LA Metro Contracting Opportunities is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.metro.net/about/doing-business-with-metro/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-lausd",
      occumedFit: "broad",
      buyerSector: "school_district",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Los Angeles Unified School District Procurement Services is an official direct procurement source for Los Angeles Unified School District, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.lausd.org/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-lawa",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Los Angeles World Airports Business Opportunities is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.lawa.org/lawa-businesses/lawa-business-opportunities",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-lawa-business",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Los Angeles World Airports Business Opportunities is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.lawa.org/lawa-businesses/lawa-procurement-services",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-long-beach",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Long Beach Purchasing is an official direct procurement source for City of Long Beach, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.longbeach.gov/finance/business-info/purchasing-division/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-los-angeles-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Los Angeles County Open Solicitations is an official direct procurement source for Los Angeles County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://doingbusiness.lacounty.gov/open-solicitations/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-los-angeles-world-airports",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Los Angeles World Airports Business Opportunities is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.lawa.org/businesses/lawa-business-opportunities",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-metro-vendor",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Los Angeles Metro Vendor Portal is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.metro.net/about/business/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-mwd",
      occumedFit: "likely",
      buyerSector: "water_wastewater_utility",
      occumedServiceCategories: [
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Metropolitan Water District Business Opportunities is an official water wastewater utility procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.mwdh2o.com/doing-business-with-mwd/business-opportunities/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-oakland",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Oakland Contracting Opportunities is an official direct procurement source for City of Oakland, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.oaklandca.gov/services/contracting-opportunities",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-oakland-purchasing",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Oakland Purchasing is an official direct procurement source for City of Oakland, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.oaklandca.gov/topics/doing-business-with-the-city",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-octa-procurement",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "OCTA Contracts Administration and Materials Management is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.octa.net/about/business/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-orange-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Orange County Open Bids is an official direct procurement source for Orange County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://cpo.ocgov.com/open-bids"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-orange-county-fire-authority",
      occumedFit: "likely",
      buyerSector: "fire_rescue",
      occumedServiceCategories: [
        "Public-Safety Medical Services",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Orange County Fire Authority Purchasing is an official fire rescue procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://ocfa.org/about-us/departments/business-services/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-pasadena",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Pasadena Purchasing is an official direct procurement source for City of Pasadena, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cityofpasadena.net/finance/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-port-la",
      occumedFit: "likely",
      buyerSector: "port_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Port of Los Angeles Contracts and Bids is an official port authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.portoflosangeles.org/business/contracting-opportunities",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-port-long-beach-contracts",
      occumedFit: "likely",
      buyerSector: "port_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Port of Long Beach Contracting Opportunities is an official port authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://polb.com/business/contracting-opportunities/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-port-of-los-angeles",
      occumedFit: "likely",
      buyerSector: "port_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Port of Los Angeles Contracting Opportunities is an official port authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://portoflosangeles.org/business/contracting-opportunities/purchasing-bids",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-port-of-oakland",
      occumedFit: "likely",
      buyerSector: "port_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Port of Oakland Bids and RFPs is an official port authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.portofoakland.com/business/bids-rfps/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-riverside-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Riverside County Purchasing is an official direct procurement source for Riverside County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://purchasing.co.riverside.ca.us/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-riverside-purchasing",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Riverside Purchasing is an official direct procurement source for City of Riverside, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://riversideca.gov/finance/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-sacramento-city",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Sacramento Procurement Services is an official direct procurement source for City of Sacramento, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cityofsacramento.gov/finance/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-sacramento-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Sacramento County Contract and Purchasing Services is an official direct procurement source for Sacramento County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://contractservices.saccounty.gov/Pages/default.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-sacstate-procurement",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Sacramento State Procurement and Contract Services is an official direct procurement source for Sacramento State, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.csus.edu/administration-business-affairs/procurement-contract-services/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-san-bernardino-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "San Bernardino County Purchasing is an official direct procurement source for San Bernardino County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://wp.sbcounty.gov/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-san-bernardino-purchasing",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of San Bernardino Purchasing is an official direct procurement source for City of San Bernardino, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.sbcity.org/city_hall/finance/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-san-diego-airport-procurement",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "San Diego County Regional Airport Authority Procurement is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.san.org/business-opportunities/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-san-diego-city",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of San Diego Purchasing and Contracting is an official direct procurement source for City of San Diego, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.sandiego.gov/purchasing/bids-contracts",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-san-diego-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "County of San Diego Bid Opportunities is an official direct procurement source for San Diego County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://sdbuynet.sandiegocounty.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-san-francisco",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City and County of San Francisco Bid Opportunities is an official direct procurement source for San Francisco, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.sf.gov/information--bid-opportunities",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-san-jose",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of San José Bid Opportunities is an official direct procurement source for City of San José, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.sanjoseca.gov/your-government/departments-offices/finance/purchasing/bid-opportunities",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-san-jose-purchasing",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of San Jose Purchasing is an official direct procurement source for City of San Jose, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.sanjoseca.gov/your-government/departments-offices/finance/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-san-mateo-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "San Mateo County Procurement is an official direct procurement source for San Mateo County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.smcgov.org/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-sandag",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "SANDAG Contracts and Procurement is an official direct procurement source for San Diego Association of Governments, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.sandag.org/contracts"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-sandag-contracts",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "SANDAG Contracts is an official direct procurement source for San Diego Association of Governments, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.sandag.org/about/contracts"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-santa-ana",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Santa Ana Bid Opportunities is an official direct procurement source for City of Santa Ana, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.santa-ana.org/bid-opportunities/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-santa-clara-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Santa Clara County Procurement Department is an official direct procurement source for Santa Clara County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.sccgov.org/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-santa-monica",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Santa Monica Vendor Resources is an official direct procurement source for City of Santa Monica, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.santamonica.gov/vendor-resources"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-sdsu-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "San Diego State University Procurement is an official direct procurement source for San Diego State University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://bfa.sdsu.edu/financial/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-sfmta-procurement",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "SFMTA Procurement is an official direct procurement source for San Francisco Municipal Transportation Agency, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.sfmta.com/business/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-sfo-business",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "San Francisco International Airport Business Opportunities is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.flysfo.com/business-at-sfo"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ca-sfsu-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "San Francisco State University Procurement is an official direct procurement source for San Francisco State University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.sfsu.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-sjsu-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "San Jose State University Procurement is an official direct procurement source for San Jose State University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.sjsu.edu/fabs/services/procurement/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-stockton-purchasing",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Stockton Purchasing is an official direct procurement source for City of Stockton, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.stocktonca.gov/government/departments/adminServices/purch.html",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-uc-berkeley",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "UC Berkeley Supply Chain Management is an official direct procurement source for UC Berkeley, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://supplychain.berkeley.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-uc-system",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University of California Procurement is an official direct procurement source for University of California, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.ucop.edu/procurement-services/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-ucd-supply-chain",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "UC Davis Supply Chain Management is an official direct procurement source for UC Davis, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://supplychain.ucdavis.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-uci-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "UC Irvine Procurement Services is an official direct procurement source for UC Irvine, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.uci.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-ucla-purchasing",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "UCLA Purchasing is an official direct procurement source for UCLA, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://purchasing.ucla.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-ucmerced-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "UC Merced Procurement is an official direct procurement source for UC Merced, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.ucmerced.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-ucr-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "UC Riverside Procurement Services is an official direct procurement source for UC Riverside, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.ucr.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-ucsb-purchasing",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "UC Santa Barbara Procurement Services is an official direct procurement source for UC Santa Barbara, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.bfs.ucsb.edu/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-ucsc-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "UC Santa Cruz Procurement Services is an official direct procurement source for UC Santa Cruz, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://financial.ucsc.edu/Pages/Procurement_Services.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-ucsd-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "UC San Diego Procurement is an official direct procurement source for UC San Diego, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://blink.ucsd.edu/buy-pay/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-ucsf-supply-chain",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "UCSF Supply Chain Management is an official direct procurement source for UCSF, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://supplychain.ucsf.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-ventura-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Ventura County Purchasing is an official direct procurement source for Ventura County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.ventura.org/general-services-agency/procurement-services/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ca-vta-procurement",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "VTA Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.vta.org/business-center/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "co-aurora",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Aurora Purchasing Services is an official direct procurement source for City of Aurora, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.auroragov.org/cms/One.aspx?portalId=1881221&pageId=2031063",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "co-boulder",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Boulder Bids and Purchasing is an official direct procurement source for City of Boulder, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://bouldercolorado.gov/services/bids-and-purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "co-colorado-springs",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Colorado Springs Procurement Services is an official direct procurement source for City of Colorado Springs, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://coloradosprings.gov/procurement-services",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "co-denver",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City and County of Denver Purchasing is an official direct procurement source for City and County of Denver, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/General-Services/Purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "co-denver-airport",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Denver International Airport Business Opportunities is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.flydenver.com/business-and-community/business-opportunities/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "co-jefferson-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Jefferson County Purchasing is an official direct procurement source for Jefferson County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.jeffco.us/2155/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "co-rtd-denver",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "RTD Denver Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.rtd-denver.com/doing-business-with-rtd/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "co-vss",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Colorado Vendor Self Service is an official direct procurement source for Colorado, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://codpa-vss.cloud.cgifederal.com/webapp/PRDVSS2X1/AltSelfService",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ct-ctsource",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Connecticut CTsource Bid Board is an official direct procurement source for Connecticut, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://portal.ct.gov/DAS/CTSource/BidBoard"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ct-hartford",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Hartford Procurement is an official direct procurement source for City of Hartford, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.hartfordct.gov/Government/Departments/Finance/Procurement-Services",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ct-new-haven",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of New Haven Purchasing is an official direct procurement source for City of New Haven, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.newhavenct.gov/government/departments-divisions/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ct-uconn",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University of Connecticut Procurement Services is an official direct procurement source for University of Connecticut, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.uconn.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "dc-ocp",
      occumedFit: "broad",
      buyerSector: "special_district",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "District of Columbia OCP Solicitations is an official direct procurement source for District of Columbia, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://ocp.dc.gov/page/ocp-solicitations"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "dc-udc-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University of the District of Columbia Procurement is an official direct procurement source for University of the District of Columbia, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.udc.edu/administration/office-of-contracts-and-procurement/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "dc-water",
      occumedFit: "likely",
      buyerSector: "water_wastewater_utility",
      occumedServiceCategories: [
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "DC Water Procurement is an official water wastewater utility procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.dcwater.com/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "de-mymarketplace",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Delaware MyMarketplace is an official direct procurement source for Delaware, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://mymarketplace.delaware.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "de-new-castle-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "New Castle County Purchasing is an official direct procurement source for New Castle County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.newcastlede.gov/249/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "de-wilmington",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Wilmington Procurement is an official direct procurement source for City of Wilmington, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.wilmingtonde.gov/government/city-departments/finance/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-broward-airport-purchasing",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Broward County Aviation Department Purchasing is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.broward.org/Airport/Business/Pages/Purchasing.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "fl-broward-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Broward County Purchasing is an official direct procurement source for Broward County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.broward.org/Purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-broward-schools",
      occumedFit: "broad",
      buyerSector: "school_district",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Broward County Public Schools Procurement is an official direct procurement source for Broward County Public Schools, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.browardschools.com/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-cape-coral-procurement",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Cape Coral Procurement is an official direct procurement source for City of Cape Coral, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.capecoral.gov/department/financial_services/procurement.php",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-famu-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Florida A&M University Procurement Services is an official direct procurement source for Florida A&M University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.famu.edu/administration/campus-services/procurement-services/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-fau-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Florida Atlantic University Procurement Services is an official direct procurement source for Florida Atlantic University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.fau.edu/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-fgcu-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Florida Gulf Coast University Procurement Services is an official direct procurement source for Florida Gulf Coast University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.fgcu.edu/adminservices/procurement/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-fiu",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Florida International University Purchasing Services is an official direct procurement source for Florida International University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://controller.fiu.edu/departments/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-fiu-purchasing",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Florida International University Purchasing Services is an official direct procurement source for Florida International University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://finance.fiu.edu/controller/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-fort-lauderdale-procurement",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Fort Lauderdale Procurement Services is an official direct procurement source for City of Fort Lauderdale, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.fortlauderdale.gov/government/departments-a-h/finance/procurement-services",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-fsu-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Florida State University Procurement Services is an official direct procurement source for Florida State University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.fsu.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-gainesville",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Gainesville Procurement is an official direct procurement source for City of Gainesville, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.gainesvillefl.gov/Government-Pages/Government/Departments/Financial-Services/Procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-greater-orlando-aviation",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Greater Orlando Aviation Authority Purchasing is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.orlandoairports.net/getting-around-mco/business-opportunities/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "fl-hart",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Hillsborough Area Regional Transit Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.gohart.org/Pages/AboutUS-Procurement.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "fl-hialeah-purchasing",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Hialeah Purchasing is an official direct procurement source for City of Hialeah, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.hialeahfl.gov/336/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-hillsborough-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Hillsborough County Procurement Services is an official direct procurement source for Hillsborough County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.hillsboroughcounty.org/en/businesses/doing-business-with-hillsborough/vendors/procurement-services",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-jacksonville",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Jacksonville Procurement is an official direct procurement source for City of Jacksonville, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.jacksonville.gov/departments/finance/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-jacksonville-aviation-authority",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Jacksonville Aviation Authority Procurement is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.flyjacksonville.com/Content2015.aspx?id=789",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "fl-jacksonville-port",
      occumedFit: "likely",
      buyerSector: "port_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Jacksonville Port Authority Procurement is an official port authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.jaxport.com/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "fl-jacksonville-procurement",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Jacksonville Procurement is an official direct procurement source for City of Jacksonville, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.jacksonville.gov/departments/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-jtafla",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Jacksonville Transportation Authority Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.jtafla.com/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "fl-lynx",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "LYNX Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.golynx.com/corporate-info/procurement.stml",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "fl-lynx-procurement",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "LYNX Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.golynx.com/corporate-info/doing-business-with-lynx/procurement.stml",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "fl-mco-procurement",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Greater Orlando Aviation Authority Procurement is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.orlandoairports.net/getting-around-mco/business-opportunities/procurement-services/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "fl-miami",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Miami Procurement is an official direct procurement source for City of Miami, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.miami.gov/Services/Doing-Business/Procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-miami-airport",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Miami International Airport Business Opportunities is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.miami-airport.com/business_opportunities.asp",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "fl-miami-dade-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Miami-Dade County Solicitations is an official direct procurement source for Miami-Dade County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.miamidade.gov/apps/ISD/stratproc/Home/CurrentSolicitations",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-miami-dade-schools",
      occumedFit: "broad",
      buyerSector: "school_district",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Miami-Dade County Public Schools Procurement is an official direct procurement source for Miami-Dade County Public Schools, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.dadeschools.net/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-miami-dade-transit-procurement",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Miami-Dade Transit Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.miamidade.gov/global/transportation/business-procurement.page",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "fl-miami-procurement",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Miami Procurement is an official direct procurement source for City of Miami, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.miamigov.com/Government/Departments-Organizations/Procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-nova-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Nova Southeastern University Procurement is an official direct procurement source for Nova Southeastern University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.nova.edu/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-orange-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Orange County Procurement is an official direct procurement source for Orange County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.orangecountyfl.net/VendorServices.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-orange-county-public-schools",
      occumedFit: "broad",
      buyerSector: "school_district",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Orange County Public Schools Procurement Services is an official direct procurement source for Orange County Public Schools, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.ocps.net/departments/procurement_services",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-orlando",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Orlando Procurement and Contracts is an official direct procurement source for City of Orlando, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.orlando.gov/Our-Government/Departments-Offices/Executive-Offices/Procurement-and-Contracts",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-palm-beach-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Palm Beach County Purchasing is an official direct procurement source for Palm Beach County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://discover.pbcgov.org/purchasing/Pages/default.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-port-everglades",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Port Everglades Business Opportunities is an official direct procurement source for Port Everglades, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.porteverglades.net/business/business-opportunities/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-port-st-lucie-procurement",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Port St. Lucie Procurement Management is an official direct procurement source for City of Port St. Lucie, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cityofpsl.com/government/departments/finance/procurement-management",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-st-petersburg",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of St. Petersburg Procurement is an official direct procurement source for City of St. Petersburg, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.stpete.org/business/procurement/index.php",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-st-petersburg-procurement",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of St. Petersburg Procurement is an official direct procurement source for City of St. Petersburg, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.stpete.org/business/procurement.php",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-tallahassee",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Tallahassee Procurement Services is an official direct procurement source for City of Tallahassee, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.talgov.com/doingbusiness/procurementservices",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-tallahassee-procurement",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Tallahassee Procurement Services is an official direct procurement source for City of Tallahassee, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.talgov.com/doingbusiness/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-tampa",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Tampa Purchasing is an official direct procurement source for City of Tampa, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.tampa.gov/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-tampa-bay-water",
      occumedFit: "likely",
      buyerSector: "water_wastewater_utility",
      occumedServiceCategories: [
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Tampa Bay Water Procurement is an official water wastewater utility procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.tampabaywater.org/business/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "fl-ucf",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University of Central Florida Procurement Services is an official direct procurement source for University of Central Florida, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.ucf.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-uf",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University of Florida Procurement Services is an official direct procurement source for University of Florida, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.ufl.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-unf-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University of North Florida Procurement Services is an official direct procurement source for University of North Florida, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.unf.edu/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-usf-purchasing",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University of South Florida Purchasing Services is an official direct procurement source for University of South Florida, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.usf.edu/business-finance/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "fl-vbs",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Florida Vendor Bid System is an official direct procurement source for Florida, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://vendor.myfloridamarketplace.com/search/bids",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ga-atl-airport-procurement",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Hartsfield-Jackson Atlanta International Airport Procurement is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.atl.com/business-information/procurement/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ga-augusta",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Augusta Procurement Department is an official direct procurement source for Augusta-Richmond County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.augustaga.gov/685/Procurement-Department",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ga-city-of-atlanta",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Atlanta Procurement is an official direct procurement source for City of Atlanta, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.atlantaga.gov/government/departments/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ga-cobb-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Cobb County Purchasing is an official direct procurement source for Cobb County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.cobbcounty.org/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ga-dekalb-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "DeKalb County Purchasing and Contracting is an official direct procurement source for DeKalb County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.dekalbcountyga.gov/purchasing-contracting/purchasing-contracting",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ga-fulton-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Fulton County Purchasing and Contract Compliance is an official direct procurement source for Fulton County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.fultoncountyga.gov/inside-fulton-county/fulton-county-departments/purchasing-contract-compliance",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ga-gpr",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Georgia Procurement Registry is an official direct procurement source for Georgia, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://ssl.doas.state.ga.us/gpr/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ga-gwinnett-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Gwinnett County Purchasing is an official direct procurement source for Gwinnett County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.gwinnettcounty.com/departments/financialservices/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ga-marta",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "MARTA Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.itsmarta.com/Procurement.aspx"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ga-port-authority-procurement",
      occumedFit: "broad",
      buyerSector: "special_district",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Georgia Ports Authority Procurement is an official direct procurement source for Georgia Ports Authority, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://gaports.com/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ga-savannah",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Savannah Purchasing is an official direct procurement source for City of Savannah, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.savannahga.gov/488/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "gu-general-services-agency",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Guam General Services Agency Procurement is an official direct procurement source for Guam, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://gsa.doa.guam.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "hi-hiepro",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Hawaii HIePRO is an official direct procurement source for Hawaii, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://hiepro.ehawaii.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "hi-honolulu",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City and County of Honolulu Purchasing is an official direct procurement source for City and County of Honolulu, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www8.honolulu.gov/bfs/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "hi-university-of-hawaii-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University of Hawaii Procurement and Real Property Management is an official direct procurement source for University of Hawaii System, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.hawaii.edu/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ia-das",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Iowa DAS Bid Opportunities is an official direct procurement source for Iowa, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://bids.sciquest.com/apps/Router/PublicEvent?CustomerOrg=DASIowa",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ia-des-moines",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Des Moines Procurement is an official direct procurement source for City of Des Moines, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.dsm.city/departments/finance/procurement.php",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ia-linn-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Linn County Purchasing is an official direct procurement source for Linn County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.linncountyiowa.gov/149/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "id-ada-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Ada County Procurement is an official direct procurement source for Ada County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://adacounty.id.gov/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "id-boise",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Boise Purchasing is an official direct procurement source for City of Boise, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cityofboise.org/departments/finance-and-administration/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "id-purchasing",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Idaho Division of Purchasing is an official direct procurement source for Idaho, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://purchasing.idaho.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "il-aurora",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Aurora Purchasing is an official direct procurement source for City of Aurora, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.aurora-il.org/235/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "il-bidbuy",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Illinois BidBuy is an official direct procurement source for Illinois, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://bidbuy.illinois.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "il-city-of-chicago",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Chicago Procurement Services is an official direct procurement source for City of Chicago, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.chicago.gov/city/en/depts/dps/provdrs/contract/svcs/current_bid_opportunities.html",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "il-cook-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Cook County Procurement is an official direct procurement source for Cook County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cookcountyil.gov/service/doing-business-cook-county",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "il-cta-procurement",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Chicago Transit Authority Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.transitchicago.com/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "il-dupage-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "DuPage County Procurement Services is an official direct procurement source for DuPage County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.dupagecounty.gov/government/departments/finance/procurement_services/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "il-flychicago-contracts",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Chicago Department of Aviation Contracts is an official direct procurement source for Chicago Department of Aviation, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.flychicago.com/business/CDA/Pages/ContractOpportunities.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "il-lake-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Lake County Purchasing is an official direct procurement source for Lake County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.lakecountyil.gov/344/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "il-metropolitan-water-reclamation-district",
      occumedFit: "likely",
      buyerSector: "water_wastewater_utility",
      occumedServiceCategories: [
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "MWRD Procurement and Materials Management is an official water wastewater utility procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://mwrd.org/procurement-and-materials-management",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "il-rta-procurement",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Regional Transportation Authority Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.rtachicago.org/doing-business/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "il-university-of-illinois-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University of Illinois System Procurement Services is an official direct procurement source for University of Illinois System, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.procure.stateuniv.state.il.us/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "il-will-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Will County Purchasing is an official direct procurement source for Will County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.willcountyillinois.com/County-Offices/Finance/Purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "in-fort-wayne",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Fort Wayne Purchasing is an official direct procurement source for City of Fort Wayne, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cityoffortwayne.org/purchasing.html",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "in-idoa",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Indiana Current Business Opportunities is an official direct procurement source for Indiana, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.in.gov/idoa/procurement/current-business-opportunities/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "in-indianapolis",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Indianapolis Purchasing Division is an official direct procurement source for City of Indianapolis / Marion County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.indy.gov/agency/purchasing-division",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ks-johnson-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Johnson County Purchasing is an official direct procurement source for Johnson County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.jocogov.org/department/financial-management-administration/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ks-procurement",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Kansas Procurement and Contracts is an official direct procurement source for Kansas, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://admin.ks.gov/offices/procurement-and-contracts/bid-solicitations",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ks-wichita",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Wichita Purchasing is an official direct procurement source for City of Wichita, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.wichita.gov/Finance/Pages/Purchasing.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ky-lexington",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Lexington-Fayette Urban County Government Purchasing is an official direct procurement source for Lexington-Fayette Urban County Government, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.lexingtonky.gov/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ky-louisville",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Louisville Metro Purchasing is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://louisvilleky.gov/government/management-budget/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ky-vss",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Kentucky Vendor Self Service is an official direct procurement source for Kentucky, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://emars311.ky.gov/webapp/vssonline/AltSelfService",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "la-baton-rouge",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City-Parish of Baton Rouge Purchasing is an official direct procurement source for City of Baton Rouge and Parish of East Baton Rouge, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.brla.gov/150/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "la-jefferson-parish",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Jefferson Parish Purchasing is an official direct procurement source for Jefferson Parish, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.jeffparish.gov/464/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "la-lapac",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Louisiana LaPAC is an official direct procurement source for Louisiana, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://wwwcfprd.doa.louisiana.gov/OSP/LaPAC/pubMain.cfm",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "la-new-orleans",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of New Orleans Purchasing is an official direct procurement source for City of New Orleans, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://nola.gov/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ma-boston-public-schools-procurement",
      occumedFit: "broad",
      buyerSector: "school_district",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Boston Public Schools Procurement is an official direct procurement source for Boston Public Schools, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.bostonpublicschools.org/Page/331"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ma-city-of-boston",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Boston Procurement is an official direct procurement source for City of Boston, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.boston.gov/departments/procurement/bid-listings",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ma-commbuys",
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
      lastRelevanceVerified: "2026-07-12",
    },
    {
      portalId: "ma-massport",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Massport Business Opportunities is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.massport.com/business-with-massport",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ma-mbta-procurement",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "MBTA Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.mbta.com/business-center/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "md-anne-arundel-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Anne Arundel County Purchasing is an official direct procurement source for Anne Arundel County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.aacounty.org/departments/central-services/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "md-baltimore-city",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Baltimore City Bureau of Procurement is an official direct procurement source for City of Baltimore, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://bbmr.baltimorecity.gov/bureau-procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "md-baltimore-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Baltimore County Purchasing is an official direct procurement source for Baltimore County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.baltimorecountymd.gov/departments/budfin/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "md-emma",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "eMaryland Marketplace Advantage is an official direct procurement source for Maryland, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://emma.maryland.gov/page.aspx/en/rfp/request_browse_public",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "md-maryland-transportation-authority",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Maryland Transportation Authority Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://mdta.maryland.gov/Business/Procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "md-montgomery-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Montgomery County Procurement is an official direct procurement source for Montgomery County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.montgomerycountymd.gov/PRO/solicitations.html",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "md-port-procurement",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Maryland Port Administration Procurement is an official direct procurement source for Maryland Port Administration, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://mpa.maryland.gov/Pages/procurement.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "md-prince-georges-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Prince George's County Contract Administration and Procurement is an official direct procurement source for Prince George's County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.princegeorgescountymd.gov/departments-offices/central-services/contract-administration-procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "md-rockville",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Rockville Procurement is an official direct procurement source for City of Rockville, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.rockvillemd.gov/1112/Procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "md-wmata",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "WMATA Procurement and Contracting is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.wmata.com/business/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "me-bangor",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Bangor Purchasing is an official direct procurement source for City of Bangor, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.bangormaine.gov/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "me-portland",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Portland Purchasing is an official direct procurement source for City of Portland, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.portlandmaine.gov/1056/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "me-rfps",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Maine Division of Procurement Services RFPs is an official direct procurement source for Maine, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.maine.gov/dafs/bbm/procurementservices/vendors/rfps",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mi-city-of-detroit",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Detroit Office of Contracting and Procurement is an official direct procurement source for City of Detroit, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://detroitmi.gov/departments/office-contracting-and-procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mi-detroit",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Detroit Office of Contracting and Procurement is an official direct procurement source for City of Detroit, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://detroitmi.gov/departments/office-chief-financial-officer/ocfo-divisions/office-contracting-and-procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mi-grand-rapids",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Grand Rapids Purchasing is an official direct procurement source for City of Grand Rapids, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.grandrapidsmi.gov/Government/Departments/Fiscal-Services/Purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mi-lansing",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Lansing Purchasing is an official direct procurement source for City of Lansing, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.lansingmi.gov/271/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mi-macomb-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Macomb County Purchasing is an official direct procurement source for Macomb County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://purchasing.macombgov.org/Purchasing-Home",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mi-oakland-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Oakland County Purchasing is an official direct procurement source for Oakland County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.oakgov.com/government/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mi-sigma",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Michigan SIGMA VSS is an official direct procurement source for Michigan, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://sigma.michigan.gov/webapp/PRDVSS2X1/AltSelfService",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mi-wayne-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Wayne County Procurement is an official direct procurement source for Wayne County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.waynecounty.com/departments/procurement/home.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mn-hennepin-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Hennepin County Supplier Portal is an official direct procurement source for Hennepin County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.hennepin.us/business/work-with-henn-co/supplier-portal",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mn-met-council",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Metropolitan Council Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://metrocouncil.org/About-Us/Doing-Business-with-the-Council.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "mn-minneapolis",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Minneapolis Procurement is an official direct procurement source for City of Minneapolis, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www2.minneapolismn.gov/business-services/doing-business-with-the-city/procurement/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mn-ramsey-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Ramsey County Procurement is an official direct procurement source for Ramsey County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.ramseycounty.us/businesses/doing-business-ramsey-county/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mn-swift",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Minnesota SWIFT Supplier Portal is an official direct procurement source for Minnesota, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://supplier.swift.state.mn.us/psc/fmssupap/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUBLIC_MENU_FL.GBL",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mo-kansas-city",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Kansas City Procurement Services is an official direct procurement source for Kansas City, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.kcmo.gov/city-hall/departments/finance/procurement-services",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mo-missouribuys",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "MissouriBUYS is an official direct procurement source for Missouri, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://missouribuys.mo.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mo-st-louis",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of St. Louis Supply Division is an official direct procurement source for City of St. Louis, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.stlouis-mo.gov/government/departments/supply/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mo-st-louis-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "St. Louis County Procurement is an official direct procurement source for St. Louis County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://stlouiscountymo.gov/st-louis-county-departments/administration/procurement/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mp-procurement",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "CNMI Procurement and Supply is an official direct procurement source for Commonwealth of the Northern Mariana Islands, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.finance.gov.mp/divisions/procurement-and-supply/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ms-hinds-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Hinds County Purchasing is an official direct procurement source for Hinds County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.hindscountyms.com/departments/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ms-jackson",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Jackson Purchasing is an official direct procurement source for City of Jackson, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.jacksonms.gov/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ms-magic",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Mississippi MAGIC Contract/Bid Search is an official direct procurement source for Mississippi, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.ms.gov/dfa/contract_bid_search/Home/Sell",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mt-billings",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Billings Purchasing is an official direct procurement source for City of Billings, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.billingsmt.gov/107/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mt-emacs",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Montana eMACS is an official direct procurement source for Montana, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://spb.mt.gov/Vendor-Resources"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "mt-missoula",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Missoula Purchasing is an official direct procurement source for City of Missoula, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.ci.missoula.mt.us/276/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nc-charlotte",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Charlotte Procurement is an official direct procurement source for City of Charlotte, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.charlottenc.gov/Growth-and-Development/Doing-Business-with-the-City",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nc-durham",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Durham Purchasing is an official direct procurement source for City of Durham, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.durhamnc.gov/1197/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nc-evp",
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
      lastRelevanceVerified: "2026-07-12",
    },
    {
      portalId: "nc-greensboro",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Greensboro Procurement Services is an official direct procurement source for City of Greensboro, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.greensboro-nc.gov/departments/financial-administrative-services/procurement-services",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nc-guilford-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Guilford County Purchasing is an official direct procurement source for Guilford County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.guilfordcountync.gov/our-county/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nc-mecklenburg-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Mecklenburg County Procurement is an official direct procurement source for Mecklenburg County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.mecknc.gov/CountyManagersOffice/Procurement/Pages/Home.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nc-raleigh",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Raleigh Procurement is an official direct procurement source for City of Raleigh, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://raleighnc.gov/doing-business/services/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nc-wake-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Wake County Vendor and Bid Opportunities is an official direct procurement source for Wake County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.wake.gov/departments-government/finance/vendor-information/bid-opportunities",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nc-winston-salem",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Winston-Salem Purchasing is an official direct procurement source for City of Winston-Salem, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.cityofws.org/1020/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nd-bismarck",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Bismarck Purchasing is an official direct procurement source for City of Bismarck, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.bismarcknd.gov/88/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nd-fargo",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Fargo Purchasing is an official direct procurement source for City of Fargo, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://fargond.gov/city-government/departments/finance/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nd-spo",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "North Dakota Current Solicitations is an official direct procurement source for North Dakota, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://apps.nd.gov/csd/spo/services/bidder/listCurrentSolicitations.htm",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ne-lincoln",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Lincoln Purchasing is an official direct procurement source for City of Lincoln, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.lincoln.ne.gov/City/Departments/Finance/Purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ne-omaha",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Omaha Purchasing is an official direct procurement source for City of Omaha, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://finance.cityofomaha.org/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ne-procurement",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Nebraska Materiel Division Bids is an official direct procurement source for Nebraska, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://das.nebraska.gov/materiel/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nh-manchester",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Manchester Purchasing is an official direct procurement source for City of Manchester, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.manchesternh.gov/Departments/Purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nh-nashua",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Nashua Purchasing is an official direct procurement source for City of Nashua, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.nashuanh.gov/390/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nh-purchasing",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "New Hampshire Bureau of Purchase and Property is an official direct procurement source for New Hampshire, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://das.nh.gov/purchasing/vendorresources.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nj-essex-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Essex County Purchasing is an official direct procurement source for Essex County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://essexcountynj.org/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nj-newark",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Newark Purchasing is an official direct procurement source for City of Newark, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.newarknj.gov/departments/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nj-njtransit",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "NJ TRANSIT Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.njtransit.com/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "nj-start",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "New Jersey START is an official direct procurement source for New Jersey, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.njstart.gov/bso/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nm-active-procurements",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "New Mexico Active Procurements is an official direct procurement source for New Mexico, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.generalservices.state.nm.us/state-purchasing/active-procurements/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nm-albuquerque",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Albuquerque Purchasing is an official direct procurement source for City of Albuquerque, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.cabq.gov/dfa/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nm-bernalillo-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Bernalillo County Purchasing is an official direct procurement source for Bernalillo County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.bernco.gov/finance/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nv-clark-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Clark County Purchasing and Contracts is an official direct procurement source for Clark County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.clarkcountynv.gov/government/departments/finance/purchasing_and_contracts/index.php",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nv-epro",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "NevadaEPro is an official direct procurement source for Nevada, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://nevadaepro.com/bso/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nv-las-vegas",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Las Vegas Purchasing and Contracts is an official direct procurement source for City of Las Vegas, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.lasvegasnevada.gov/Government/Departments/Finance/Purchasing-Contracts",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "nv-washoe-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Washoe County Purchasing is an official direct procurement source for Washoe County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.washoecounty.gov/clerks/cco/purchasing.php",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-albany-city",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Albany Purchasing is an official direct procurement source for City of Albany, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.albanyny.gov/331/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-albany-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Albany County Purchasing is an official direct procurement source for Albany County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.albanycountyny.gov/departments/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-albany-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University at Albany Purchasing is an official direct procurement source for University at Albany, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.albany.edu/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-binghamton-purchasing",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Binghamton University Purchasing is an official direct procurement source for Binghamton University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.binghamton.edu/offices/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-buffalo",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Buffalo Purchasing is an official direct procurement source for City of Buffalo, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.buffalony.gov/313/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-buffalo-niagara-airport",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Buffalo Niagara International Airport Business Opportunities is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.nfta.com/business-center/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ny-buffalo-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University at Buffalo Procurement Services is an official direct procurement source for University at Buffalo, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.buffalo.edu/administrative-services/managing-procurement.html",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-buffalo-public-schools",
      occumedFit: "broad",
      buyerSector: "school_district",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Buffalo Public Schools Purchasing is an official direct procurement source for Buffalo Public Schools, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.buffaloschools.org/Page/95165"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-buffalo-schools",
      occumedFit: "broad",
      buyerSector: "school_district",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Buffalo Public Schools Purchasing is an official direct procurement source for Buffalo Public Schools, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.buffaloschools.org/Page/360"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-city-of-new-york",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "New York City PASSPort Public is an official direct procurement source for New York City, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://a0333-passportpublic.nyc.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-columbia-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Columbia University Purchasing is an official direct procurement source for Columbia University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.columbia.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-contract-reporter",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "New York State Contract Reporter is an official direct procurement source for New York, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.nyscr.ny.gov/contracts.cfm"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-cornell-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Cornell Procurement Services is an official direct procurement source for Cornell University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.dfa.cornell.edu/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-cuny",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "CUNY Procurement is an official direct procurement source for City University of New York, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cuny.edu/about/administration/offices/budget-and-finance/procurement/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-cuny-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "CUNY Procurement is an official direct procurement source for City University of New York, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cuny.edu/about/administration/offices/cis/core-functions/procurement/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-erie-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Erie County Purchasing is an official direct procurement source for Erie County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www3.erie.gov/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-monroe-county-water-authority",
      occumedFit: "likely",
      buyerSector: "water_wastewater_utility",
      occumedServiceCategories: [
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Monroe County Water Authority Purchasing is an official water wastewater utility procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.mcwa.com/about/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ny-mta",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "MTA Doing Business With Us is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://new.mta.info/doing-business-with-us"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ny-mta-procurement",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Metropolitan Transportation Authority Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://new.mta.info/doing-business-with-us/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ny-nassau-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Nassau County Purchasing is an official direct procurement source for Nassau County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.nassaucountyny.gov/1559/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-nfta",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Niagara Frontier Transportation Authority Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.nfta.com/business-center/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ny-nyc-dcas",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "New York City DCAS Procurement is an official direct procurement source for City of New York, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.nyc.gov/site/dcas/business/procurement.page",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-nyc-ddc",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "New York City DDC RFPs and RFQs is an official direct procurement source for New York City Department of Design and Construction, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.nyc.gov/site/ddc/contracts/rfps-rfqs.page",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-nyc-dot",
      occumedFit: "likely",
      buyerSector: "transportation_department",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Medical Surveillance / Exposure Programs",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "New York City DOT Bid Opportunities is an official transportation department procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.nyc.gov/html/dot/html/about/doing-business.shtml",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ny-nycha",
      occumedFit: "broad",
      buyerSector: "housing_authority",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "NYCHA Procurement Opportunities is an official direct procurement source for New York City Housing Authority, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.nyc.gov/site/nycha/business/procurement-opportunities.page",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-nyu-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "NYU Procurement is an official direct procurement source for New York University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.nyu.edu/about/leadership-university-administration/office-of-the-president/office-of-the-executive-vice-president/finance-and-budget/procurement.html",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-onondaga-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Onondaga County Purchasing is an official direct procurement source for Onondaga County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.ongov.net/purchase/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-port-authority",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Port Authority of New York and New Jersey Procurement is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.panynj.gov/port-authority/en/business-opportunities.html",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ny-rochester",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Rochester Purchasing is an official direct procurement source for City of Rochester, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cityofrochester.gov/departments/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-rochester-genesee-regional-transportation",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "RGRTA Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.myrts.com/About-RTS/Procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "ny-rochester-schools",
      occumedFit: "broad",
      buyerSector: "school_district",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Rochester City School District Purchasing is an official direct procurement source for Rochester City School District, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.rcsdk12.org/Page/808"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-stonybrook-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Stony Brook University Procurement is an official direct procurement source for Stony Brook University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.stonybrook.edu/commcms/procurement/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-suffolk-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Suffolk County Purchasing is an official direct procurement source for Suffolk County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.suffolkcountyny.gov/Departments/Purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-suny",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "SUNY Procurement is an official direct procurement source for State University of New York, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.suny.edu/meansbusiness/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-syracuse",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Syracuse Purchasing is an official direct procurement source for City of Syracuse, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.syr.gov/Departments/Finance/Purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-syracuse-purchasing",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Syracuse University Purchasing is an official direct procurement source for Syracuse University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://purchasing.syr.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-syracuse-schools",
      occumedFit: "broad",
      buyerSector: "school_district",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Syracuse City School District Purchasing is an official direct procurement source for Syracuse City School District, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.syracusecityschools.com/districtpage.cfm?pageid=539",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ny-westchester-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Westchester County Purchasing is an official direct procurement source for Westchester County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.westchestergov.com/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "oh-cincinnati",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Cincinnati Purchasing is an official direct procurement source for City of Cincinnati, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.cincinnati-oh.gov/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "oh-cleveland",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Cleveland Procurement is an official direct procurement source for City of Cleveland, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.clevelandohio.gov/city-hall/departments/finance/divisions/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "oh-columbus",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Columbus Vendor Services is an official direct procurement source for City of Columbus, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.columbus.gov/finance/financial-management-group/purchasing-office/vendor-services",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "oh-cuyahoga-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Cuyahoga County Procurement and Diversity is an official direct procurement source for Cuyahoga County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://cuyahogacounty.gov/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "oh-franklin-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Franklin County Purchasing is an official direct procurement source for Franklin County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://purchasing.franklincountyohio.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "oh-hamilton-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Hamilton County Purchasing is an official direct procurement source for Hamilton County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.hamiltoncountyohio.gov/government/departments/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "oh-ohiobuys",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "OhioBuys / Ohio Procurement is an official direct procurement source for Ohio, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://procure.ohio.gov/proc/view-procurement-opportunities",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ok-central-purchasing",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Oklahoma Central Purchasing is an official direct procurement source for Oklahoma, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://oklahoma.gov/omes/services/purchasing/solicitations.html",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ok-oklahoma-city",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Oklahoma City Bids and Proposals is an official direct procurement source for City of Oklahoma City, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.okc.gov/departments/finance/purchasing/bids-proposals",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ok-tulsa",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Tulsa Purchasing is an official direct procurement source for City of Tulsa, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cityoftulsa.org/government/departments/finance/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "or-multnomah-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Multnomah County Purchasing is an official direct procurement source for Multnomah County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.multco.us/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "or-oregonbuys",
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
      lastRelevanceVerified: "2026-07-12",
    },
    {
      portalId: "or-portland",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Portland Procurement Services is an official direct procurement source for City of Portland, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.portland.gov/omf/brfs/procurement/bids",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "or-trimet",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "TriMet Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://trimet.org/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "or-washington-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Washington County Purchasing is an official direct procurement source for Washington County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.washingtoncountyor.gov/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "pa-allegheny-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Allegheny County Purchasing and Supplies is an official direct procurement source for Allegheny County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.alleghenycounty.us/Services/Purchasing-and-Supplies",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "pa-allentown",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Allentown Purchasing is an official direct procurement source for City of Allentown, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.allentownpa.gov/Finance/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "pa-bucks-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Bucks County Purchasing is an official direct procurement source for Bucks County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.buckscounty.gov/149/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "pa-city-of-philadelphia",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Philadelphia Contracts Hub is an official direct procurement source for City of Philadelphia, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://contracts.phila.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "pa-emarketplace",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Pennsylvania eMarketplace is an official direct procurement source for Pennsylvania, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.emarketplace.state.pa.us/Solicitations.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "pa-montgomery-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Montgomery County Purchasing is an official direct procurement source for Montgomery County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.montgomerycountypa.gov/94/Purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "pa-philadelphia",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Philadelphia Procurement Department is an official direct procurement source for City of Philadelphia, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.phila.gov/departments/procurement-department/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "pa-pittsburgh",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Pittsburgh Procurement is an official direct procurement source for City of Pittsburgh, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://pittsburghpa.gov/finance/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "pa-septa",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "SEPTA Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.septa.org/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "pa-septa-procurement",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "SEPTA Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.septa.org/business/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "pr-general-services-administration",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Puerto Rico General Services Administration is an official direct procurement source for Puerto Rico, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://asg.pr.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "pr-university-of-puerto-rico",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University of Puerto Rico Purchasing is an official direct procurement source for University of Puerto Rico, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.upr.edu/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ri-bids",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Rhode Island Division of Purchases Bidding Opportunities is an official direct procurement source for Rhode Island, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://ridop.ri.gov/vendors/bidding-opportunities",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ri-providence",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Providence Purchasing is an official direct procurement source for City of Providence, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.providenceri.gov/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ri-warwick",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Warwick Purchasing is an official direct procurement source for City of Warwick, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.warwickri.gov/purchasing-department",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "sc-bid-opps",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "South Carolina Bid Opportunities is an official direct procurement source for South Carolina, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.sc.gov/doing-biz/bid-opps"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "sc-charleston-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Charleston County Procurement is an official direct procurement source for Charleston County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.charlestoncounty.org/departments/procurement/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "sc-greenville-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Greenville County Procurement Services is an official direct procurement source for Greenville County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.greenvillecounty.org/Procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "sc-ports-procurement",
      occumedFit: "broad",
      buyerSector: "special_district",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "South Carolina Ports Procurement is an official direct procurement source for South Carolina Ports Authority, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://scspa.com/about/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "sc-richland-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Richland County Procurement is an official direct procurement source for Richland County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.richlandcountysc.gov/Government/Departments/Business-Operations/Procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "sd-rapid-city",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Rapid City Purchasing is an official direct procurement source for City of Rapid City, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.rcgov.org/departments/finance/purchasing.html",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "sd-sioux-falls",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Sioux Falls Purchasing is an official direct procurement source for City of Sioux Falls, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.siouxfalls.gov/business-permits/business/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "sd-solicitations",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "South Dakota Procurement Solicitations is an official direct procurement source for South Dakota, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://boa.sd.gov/central-services/procurement-management/solicitations.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tn-chattanooga",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Chattanooga Purchasing is an official direct procurement source for City of Chattanooga, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://chattanooga.gov/finance/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tn-edison-rfps",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Tennessee Edison RFP Opportunities is an official direct procurement source for Tennessee, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.tn.gov/generalservices/procurement/central-procurement-office--cpo-/supplier-information/request-for-proposals--rfp--opportunities.html",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tn-knoxville",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Knoxville Purchasing is an official direct procurement source for City of Knoxville, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.knoxvilletn.gov/government/city_departments_offices/finance/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tn-memphis",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Memphis Purchasing is an official direct procurement source for City of Memphis, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.memphistn.gov/government/finance/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tn-nashville",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Metropolitan Government of Nashville Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.nashville.gov/departments/finance/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "tx-arlington",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Arlington Purchasing is an official direct procurement source for City of Arlington, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.arlingtontx.gov/city_hall/departments/finance/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-austin",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Austin Financial Services Purchasing is an official direct procurement source for City of Austin, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.austintexas.gov/department/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-austin-purchasing",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Austin Purchasing Office is an official direct procurement source for City of Austin, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.austintexas.gov/department/purchasing-office",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-bexar-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Bexar County Purchasing is an official direct procurement source for Bexar County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.bexar.org/1435/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-capmetro",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "CapMetro Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.capmetro.org/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "tx-city-of-austin",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Austin Active Solicitations is an official direct procurement source for City of Austin, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://financeonline.austintexas.gov/afo/account_services/solicitation/solicitations.cfm",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-city-of-dallas",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Dallas Procurement Services is an official direct procurement source for City of Dallas, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://dallascityhall.com/departments/procurement-services/Pages/default.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-city-of-houston",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Houston Strategic Procurement is an official direct procurement source for City of Houston, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.houstontx.gov/obo/strategic_procurement.html",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-city-of-san-antonio",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of San Antonio Bidding and Contracting is an official direct procurement source for City of San Antonio, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://webapp1.sanantonio.gov/BidContractOpps/Default.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-collin-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Collin County Purchasing is an official direct procurement source for Collin County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.collincountytx.gov/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-corpus-christi",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Corpus Christi Contracts and Procurement is an official direct procurement source for City of Corpus Christi, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cctexas.com/services/business/contracts-and-procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-corpus-christi-purchasing",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Corpus Christi Contracts and Procurement is an official direct procurement source for City of Corpus Christi, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cctexas.com/departments/contracts-and-procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-dallas-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Dallas County Purchasing is an official direct procurement source for Dallas County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.dallascounty.org/departments/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-dallas-isd",
      occumedFit: "broad",
      buyerSector: "school_district",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Dallas ISD Procurement Services is an official direct procurement source for Dallas Independent School District, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.dallasisd.org/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-dart",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "DART Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.dart.org/about/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "tx-dart-procurement",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "DART Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.dart.org/business/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "tx-dfw-airport",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "DFW Airport Procurement is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.dfwairport.com/business/solicitations/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "tx-el-paso",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of El Paso Purchasing and Strategic Sourcing is an official direct procurement source for City of El Paso, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.elpasotexas.gov/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-el-paso-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "El Paso County Purchasing is an official direct procurement source for El Paso County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.epcounty.com/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-esbd",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Texas ESBD / Texas SmartBuy is an official direct procurement source for Texas, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.txsmartbuy.gov/esbd"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-fort-worth",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Fort Worth Purchasing is an official direct procurement source for City of Fort Worth, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.fortworthtexas.gov/departments/finance/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-frisco",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Frisco Purchasing is an official direct procurement source for City of Frisco, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.friscotexas.gov/133/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-harris-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Harris County Online Solicitation Opportunities is an official direct procurement source for Harris County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://purchasing.harriscountytx.gov/Services/Online-Solicitation-Opportunities",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-houston",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Houston Strategic Procurement Division is an official direct procurement source for City of Houston, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.houstontx.gov/bizwithhou/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-houston-airports",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Houston Airports Business Opportunities is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.fly2houston.com/biz/opportunities"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "tx-houston-isd",
      occumedFit: "broad",
      buyerSector: "school_district",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Houston ISD Procurement Services is an official direct procurement source for Houston Independent School District, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.houstonisd.org/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-houston-procurement",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Houston Strategic Procurement is an official direct procurement source for City of Houston, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.houstontx.gov/obo/procurement.html"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-irving",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Irving Purchasing is an official direct procurement source for City of Irving, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.cityofirving.org/89/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-laredo",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Laredo Purchasing is an official direct procurement source for City of Laredo, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cityoflaredo.com/departments/financial-services/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-laredo-purchasing",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Laredo Purchasing is an official direct procurement source for City of Laredo, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cityoflaredo.com/Purchasing/Purchasing.html",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-lubbock",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Lubbock Purchasing and Contract Management is an official direct procurement source for City of Lubbock, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://ci.lubbock.tx.us/departments/purchasing-contract-management",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-metro-houston-procurement",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "METRO Houston Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.ridemetro.org/about/metrobusiness/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "tx-plano",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Plano Purchasing is an official direct procurement source for City of Plano, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.plano.gov/194/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-port-houston",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Port Houston Procurement Services is an official direct procurement source for Port Houston, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://porthouston.com/business/procurement-services/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-port-houston-procurement",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Port Houston Procurement Services is an official direct procurement source for Port Houston, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://porthouston.com/procurement-services/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-rice-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Rice University Procurement is an official direct procurement source for Rice University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.rice.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-richardson",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Richardson Purchasing is an official direct procurement source for City of Richardson, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.cor.net/departments/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-san-antonio",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of San Antonio Purchasing is an official direct procurement source for City of San Antonio, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.sa.gov/Directory/Departments/Finance/Purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-san-antonio-purchasing",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of San Antonio Purchasing is an official direct procurement source for City of San Antonio, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.sa.gov/Directory/Departments/Finance/About/Divisions/Procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-san-antonio-water",
      occumedFit: "likely",
      buyerSector: "water_wastewater_utility",
      occumedServiceCategories: [
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "San Antonio Water System Contracting is an official water wastewater utility procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.saws.org/business-center/contracting/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "tx-san-antonio-water-system",
      occumedFit: "likely",
      buyerSector: "water_wastewater_utility",
      occumedServiceCategories: [
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "San Antonio Water System Purchasing is an official water wastewater utility procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.saws.org/business-center/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "tx-tarrant-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Tarrant County Purchasing is an official direct procurement source for Tarrant County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.tarrantcountytx.gov/en/purchasing.html",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-texas-am",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Texas A&M University Procurement Services is an official direct procurement source for Texas A&M University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.tamu.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-texasstate-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Texas State University Procurement is an official direct procurement source for Texas State University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.procurement.txst.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-travis-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Travis County Purchasing Office is an official direct procurement source for Travis County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.traviscountytx.gov/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-ttu-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Texas Tech Procurement Services is an official direct procurement source for Texas Tech University, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.depts.ttu.edu/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-uh-purchasing",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University of Houston Purchasing is an official direct procurement source for University of Houston, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.uh.edu/office-of-finance/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-university-of-texas-system",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University of Texas System Supply Chain Alliance is an official direct procurement source for University of Texas System, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.utsystem.edu/offices/supply-chain-alliance",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-unt-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University of North Texas Procurement Services is an official direct procurement source for University of North Texas, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://finance.untsystem.edu/procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-ut-austin-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "University of Texas at Austin Procurement is an official direct procurement source for University of Texas at Austin, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://purchasing.utexas.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-utd-procurement",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "UT Dallas Procurement Management is an official direct procurement source for University of Texas at Dallas, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://procurement.utdallas.edu/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-utep-purchasing",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "UTEP Purchasing and General Services is an official direct procurement source for University of Texas at El Paso, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.utep.edu/vpba/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-utsa-purchasing",
      occumedFit: "broad",
      buyerSector: "public_university",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "UTSA Purchasing and Distribution Services is an official direct procurement source for University of Texas at San Antonio, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.utsa.edu/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "tx-via",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "VIA Metropolitan Transit Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.viainfo.net/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "uk-contracts-finder",
      occumedFit: "broad",
      buyerSector: "international_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "UK Contracts Finder is an official direct procurement source for United Kingdom, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.contractsfinder.service.gov.uk/Search",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "us-sam-gov",
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
      lastRelevanceVerified: "2026-07-12",
    },
    {
      portalId: "ut-current-bids",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Utah Current Bids is an official direct procurement source for Utah, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://purchasing.utah.gov/for-vendors/current-bids/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ut-salt-lake-city",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Salt Lake City Purchasing is an official direct procurement source for Salt Lake City, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.slc.gov/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ut-salt-lake-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Salt Lake County Contracts and Procurement is an official direct procurement source for Salt Lake County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.saltlakecounty.gov/contracts/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "ut-uta",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Utah Transit Authority Procurement is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.rideuta.com/Doing-Business/Procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "va-alexandria",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Alexandria Purchasing is an official direct procurement source for City of Alexandria, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.alexandriava.gov/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "va-chesapeake",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Chesapeake Purchasing is an official direct procurement source for City of Chesapeake, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cityofchesapeake.net/1062/Purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "va-eva",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Virginia eVA / Business Opportunities is an official direct procurement source for Virginia, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://eva.virginia.gov/business-opportunities.html",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "va-fairfax-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Fairfax County Current Solicitations is an official direct procurement source for Fairfax County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.fairfaxcounty.gov/solicitation/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "va-henrico-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Henrico County Purchasing is an official direct procurement source for Henrico County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://henrico.us/purchasing/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "va-loudoun-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Loudoun County Procurement is an official direct procurement source for Loudoun County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.loudoun.gov/1153/Procurement"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "va-norfolk",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Norfolk Purchasing is an official direct procurement source for City of Norfolk, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.norfolk.gov/291/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "va-port-procurement",
      occumedFit: "likely",
      buyerSector: "port_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Virginia Port Authority Procurement is an official port authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.portofvirginia.com/about/procurement/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "va-prince-william-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Prince William County Purchasing is an official direct procurement source for Prince William County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.pwcva.gov/department/purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "va-richmond",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Richmond Procurement Services is an official direct procurement source for City of Richmond, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.rva.gov/procurement-services"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "va-virginia-beach",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Virginia Beach Purchasing is an official direct procurement source for City of Virginia Beach, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.vbgov.com/government/departments/finance/Pages/purchasing.aspx",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "vi-property-and-procurement",
      occumedFit: "broad",
      buyerSector: "general_procurement",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "USVI Department of Property and Procurement is an official direct procurement source for U.S. Virgin Islands, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://dpp.vi.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "vi-water-and-power-authority-procurement",
      occumedFit: "likely",
      buyerSector: "water_wastewater_utility",
      occumedServiceCategories: [
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Virgin Islands Water and Power Authority Procurement is an official water wastewater utility procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: ["https://www.viwapa.vi/about/procurement/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "vt-bid-system",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Vermont Business Registry Bid System is an official direct procurement source for Vermont, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.vermontbusinessregistry.com/BidSystem/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "vt-burlington",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Burlington RFPs and Bids is an official direct procurement source for City of Burlington, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.burlingtonvt.gov/RFP"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "vt-south-burlington",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of South Burlington Purchasing is an official direct procurement source for City of South Burlington, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.southburlingtonvt.gov/business/purchasing.php",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wa-king-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "King County Solicitations is an official direct procurement source for King County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://kingcounty.gov/en/business/do-business-with-king-county/solicitations",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wa-port-of-seattle",
      occumedFit: "likely",
      buyerSector: "airport_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Port of Seattle Bid Opportunities is an official airport authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.portseattle.org/business/bid-opportunities",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "wa-port-seattle-procurement",
      occumedFit: "likely",
      buyerSector: "port_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Medical Surveillance / Exposure Programs",
        "Respiratory Protection / Fit Testing",
        "Hearing Conservation / Audiometry",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Port of Seattle Procurement is an official port authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.portseattle.org/business/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "wa-seattle",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Seattle Purchasing and Contracting is an official direct procurement source for City of Seattle, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.seattle.gov/purchasing-and-contracting",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wa-snohomish-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Snohomish County Purchasing is an official direct procurement source for Snohomish County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://snohomishcountywa.gov/300/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wa-sound-transit",
      occumedFit: "likely",
      buyerSector: "transit_authority",
      occumedServiceCategories: [
        "Drug / Alcohol Testing and Program Administration",
        "Public-Safety Medical Services",
        "Fitness-for-Duty / Return-to-Work / Work Capacity",
      ],
      relevanceReasonCodes: ["portal_likely"],
      relevanceEvidence: [
        "Sound Transit Procurement and Contracts is an official transit authority procurement source. The reviewed buyer/entity profile indicates a safety-sensitive, regulated, exposure-prone, public-safety, or operational workforce that can create Occu-Med-relevant needs; no direct matching solicitation is claimed for this portal record.",
      ],
      relevanceEvidenceUrls: [
        "https://www.soundtransit.org/get-to-know-us/doing-business/procurement-contracts",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_buyer_propensity",
    },
    {
      portalId: "wa-spokane",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Spokane Purchasing is an official direct procurement source for City of Spokane, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://my.spokanecity.org/business/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wa-spokane-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Spokane County Purchasing is an official direct procurement source for Spokane County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://www.spokanecounty.org/459/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wa-webs",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Washington WEBS is an official direct procurement source for Washington, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://pr-webs-customer.des.wa.gov/"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wi-esupplier",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Wisconsin eSupplier is an official direct procurement source for Wisconsin, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://esupplier.wi.gov/psp/esupplier/SUPPLIER/ERP/c/NUI_FRAMEWORK.PT_LANDINGPAGE.GBL",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wi-madison",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Madison Purchasing Services is an official direct procurement source for City of Madison, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cityofmadison.com/finance/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wi-milwaukee",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Milwaukee Purchasing is an official direct procurement source for City of Milwaukee, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: ["https://city.milwaukee.gov/Purchasing"],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wi-milwaukee-county",
      occumedFit: "broad",
      buyerSector: "county_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Milwaukee County Procurement is an official direct procurement source for Milwaukee County, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://county.milwaukee.gov/EN/Administrative-Services/Procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "worldbank-procurement",
      occumedFit: "broad",
      buyerSector: "multilateral_organization",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "World Bank Procurement Notices is an official direct procurement source for World Bank, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://projects.worldbank.org/en/projects-operations/procurement",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wv-charleston",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Charleston Purchasing is an official direct procurement source for City of Charleston, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.charlestonwv.gov/government/city-departments/finance/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wv-huntington",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Huntington Purchasing is an official direct procurement source for City of Huntington, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cityofhuntington.com/city-government/departments/finance/purchasing/",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wv-purchasing-bulletin",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "West Virginia Purchasing Bulletin is an official direct procurement source for West Virginia, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.state.wv.us/admin/purchase/bids.html",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wy-bid-opportunities",
      occumedFit: "broad",
      buyerSector: "state_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "Wyoming Bid Opportunities is an official direct procurement source for Wyoming, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://ai.wyo.gov/divisions/procurement/bid-opportunities",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wy-casper",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Casper Purchasing is an official direct procurement source for City of Casper, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.casperwy.gov/government/city_manager/purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
    {
      portalId: "wy-cheyenne",
      occumedFit: "broad",
      buyerSector: "municipal_government",
      occumedServiceCategories: [],
      relevanceReasonCodes: ["portal_broad"],
      relevanceEvidence: [
        "City of Cheyenne Purchasing is an official direct procurement source for City of Cheyenne, but the completed review did not identify a specific Occu-Med-relevant solicitation, contract, award, forecast, or workforce-regulatory evidence record for this portal.",
      ],
      relevanceEvidenceUrls: [
        "https://www.cheyennecity.org/Your-Government/Departments/Finance/Purchasing",
      ],
      lastRelevanceVerified: "2026-07-12",
      reviewMethod: "official_broad_portal",
    },
  ];

export const DIRECT_RFP_PORTAL_RELEVANCE_BY_ID = new Map(
  DIRECT_RFP_PORTAL_RELEVANCE_RECORDS.map((record) => [
    record.portalId,
    record,
  ]),
);

export const ENRICHED_DIRECT_RFP_PORTALS: EnrichedDirectRfpPortal[] =
  DIRECT_RFP_PORTALS.map((portal) => {
    const record = DIRECT_RFP_PORTAL_RELEVANCE_BY_ID.get(portal.id);
    if (!record) {
      throw new Error(`Missing Occu-Med relevance record for ${portal.id}`);
    }
    return {
      ...portal,
      occumedFit: record.occumedFit,
      buyerSector: record.buyerSector,
      occumedServiceCategories: record.occumedServiceCategories,
      relevanceReasonCodes: record.relevanceReasonCodes,
      relevanceEvidence: record.relevanceEvidence,
      relevanceEvidenceUrls: record.relevanceEvidenceUrls,
      lastRelevanceVerified: record.lastRelevanceVerified,
      reviewMethod: record.reviewMethod,
    };
  });

const FIT_ORDER: Record<PortalFit | "unclassified", number> = {
  verified_high: 0,
  likely: 1,
  broad: 2,
  insufficient_evidence: 3,
  unclassified: 4,
  irrelevant: 5,
};

export function enrichedDirectRfpPortalsForOccuMedSearch(
  options: {
    includeTier3?: boolean;
    minimumFit?: Exclude<PortalFit, "irrelevant">;
    includeIrrelevant?: boolean;
  } = {},
): EnrichedDirectRfpPortal[] {
  const includeTier3 = options.includeTier3 ?? true;
  const minimum = options.minimumFit ? FIT_ORDER[options.minimumFit] : null;
  return ENRICHED_DIRECT_RFP_PORTALS.filter(
    (portal) =>
      portal.level !== "federal" &&
      (includeTier3 || portal.tier !== 3) &&
      (options.includeIrrelevant === true ||
        portal.occumedFit !== "irrelevant") &&
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
    if (!/^\d{4}-\d{2}-\d{2}$/.test(record.lastRelevanceVerified))
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
