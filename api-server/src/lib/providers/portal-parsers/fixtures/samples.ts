import { PORTAL_PARSER_REGISTRY } from "../index";

export const PORTAL_PARSER_SAMPLE_FIXTURES = [
  { sourceId: "us-sam-gov", data: [{ title: "Occupational Health Services", solicitationNumber: "FA1234-26-R-0001", agency: "Department of Air Force", postedDate: "2026-07-01", responseDeadline: "2026-08-15", url: "https://sam.gov/opp/example" }] },
  { sourceId: "ca-caleprocure", data: [{ eventTitle: "Drug Testing Services", eventId: "0000031234", department: "Department of Transportation", endDate: "08/21/2026", link: "https://caleprocure.ca.gov/event/0000031234" }] },
  { sourceId: "tx-esbd", data: [{ bidTitle: "Employee Physical Exams", bidNumber: "601-26-001", buyer: "Texas Department of Transportation", dueDate: "2026-09-01", href: "https://www.txsmartbuy.gov/esbd/601-26-001" }] },
  { sourceId: "ny-contract-reporter", data: [{ title: "Medical Surveillance Program", CR: "2069934", agency: "Office of General Services", dueDate: "September 12, 2026", url: "https://www.nyscr.ny.gov/contracts.cfm" }] },
  { sourceId: "fl-vbs", data: [{ title: "Random Drug Testing", bidNumber: "ITB-26-100", agency: "Department of Management Services", closingDate: "2026-08-30", sourceUrl: "https://vendor.myfloridamarketplace.com/search/bids/detail/ITB-26-100" }] },
];

export function validatePortalParserSamples(): boolean {
  return PORTAL_PARSER_SAMPLE_FIXTURES.every((fixture) => (PORTAL_PARSER_REGISTRY[fixture.sourceId]?.({ sourceId: fixture.sourceId, data: fixture.data }) ?? []).length > 0);
}
