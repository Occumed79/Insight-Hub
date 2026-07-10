import { createPortalParser } from "./generic";

export const parseVirginiaEva = createPortalParser({
  state: "VA",
  baseUrl: "https://eva.virginia.gov/",
  fieldMap: {
    title: ["Opportunity Title", "Solicitation Title", "Title"],
    sourceUrl: ["Opportunity URL", "URL", "Link"],
    agency: ["Buyer", "Agency", "Organization"],
    solicitationNumber: ["Solicitation Number", "Quick Quote Number", "IFB Number", "RFP Number"],
    postedDate: ["Posted Date", "Issue Date"],
    responseDeadline: ["Closing Date", "Due Date", "Response Deadline"],
    description: ["Description", "Summary"],
  },
  textPatterns: {
    solicitationNumber: [/(?:Solicitation|Quick Quote) Number\s*[:#-]\s*([A-Z0-9_.-]+)/i],
    deadlineLabels: ["closing date", "response deadline"],
  },
});
