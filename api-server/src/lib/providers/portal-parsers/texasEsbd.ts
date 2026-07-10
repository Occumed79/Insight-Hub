import { createPortalParser } from "./generic";

export const parseTexasEsbd = createPortalParser({
  state: "TX",
  baseUrl: "https://www.txsmartbuy.gov/esbd",
  fieldMap: {
    title: ["NIGP Description", "Solicitation Title", "Bid Title", "Title"],
    sourceUrl: ["URL", "Detail URL", "Bid URL"],
    agency: ["Agency", "Agency Name", "Purchaser"],
    solicitationNumber: ["Solicitation ID", "Solicitation Number", "Bid Number", "ESBD ID"],
    postedDate: ["Posted Date", "Publish Date"],
    responseDeadline: ["Response Due Date", "Due Date", "Bid Opening Date", "Closing Date"],
    description: ["NIGP Description", "Description", "Summary"],
  },
  textPatterns: {
    solicitationNumber: [/Solicitation ID\s*[:#-]\s*([A-Z0-9_.-]+)/i],
    deadlineLabels: ["response due date", "bid opening date", "due date"],
  },
});
