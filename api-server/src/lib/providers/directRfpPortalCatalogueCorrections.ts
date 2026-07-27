import type { DirectRfpPortal } from "./directRfpPortals";

const GENERATED_PORTAL_OVERRIDES: Readonly<Record<string, Partial<DirectRfpPortal>>> = {
  "ca-calaveras-county": {
    name: "Calaveras County Invitations to Bid",
    searchUrl:
      "https://administration.calaverasgov.us/RFP-RFQ-SOQ/Invitation-to-Bid",
    domain: "administration.calaverasgov.us",
    accessMode: "public_html",
    requiresLogin: false,
    parserStatus: "catalog_only",
    notes:
      "Official Calaveras County invitation-to-bid and solicitation landing page. The separate Public Purchase marketplace is not represented as a direct catalogue source.",
  },
  "tn-anderson-county": {
    searchUrl: "https://andersoncountytn.gov/purchasing/",
    domain: "andersoncountytn.gov",
    accessMode: "public_html",
    requiresLogin: false,
    parserStatus: "catalog_only",
    notes:
      "Official Anderson County Purchasing page retained as catalogue inventory. The buyer's BidNet marketplace page is excluded from the direct-source catalogue.",
  },
  "tn-sullivan-county": {
    searchUrl: "https://sullivancountytn.gov/purchasing/",
    domain: "sullivancountytn.gov",
    accessMode: "public_html",
    requiresLogin: false,
    parserStatus: "catalog_only",
    notes:
      "Official Sullivan County Purchasing page retained as catalogue inventory. The buyer's BidNet marketplace page is excluded from the direct-source catalogue.",
  },
  "tn-williamson-county": {
    searchUrl: "https://www.williamsoncounty-tn.gov/406/Purchasing",
    domain: "williamsoncounty-tn.gov",
    accessMode: "public_html",
    requiresLogin: false,
    parserStatus: "catalog_only",
    notes:
      "Official Williamson County Purchasing page retained as catalogue inventory. The buyer's BidNet marketplace page is excluded from the direct-source catalogue.",
  },
  "ca-lake-county": { parserStatus: "ready_to_parse" },
  "ca-nevada-county": { parserStatus: "ready_to_parse" },
  "ny-columbia-county": { parserStatus: "ready_to_parse" },
  "tn-blount-county": { parserStatus: "ready_to_parse" },
  "wa-whitman-county": { parserStatus: "ready_to_parse" },
};

export function applyGeneratedPortalCatalogueCorrections(
  portals: readonly DirectRfpPortal[],
): DirectRfpPortal[] {
  return portals.map((portal) => {
    const override = GENERATED_PORTAL_OVERRIDES[portal.id];
    return override ? { ...portal, ...override } : portal;
  });
}
