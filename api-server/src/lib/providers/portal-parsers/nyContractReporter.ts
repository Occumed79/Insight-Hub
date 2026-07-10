import { createPortalParser } from "./generic";

export const parseNewYorkContractReporter = createPortalParser({
  state: "NY",
  baseUrl: "https://www.nyscr.ny.gov/",
  fieldMap: {
    title: ["Ad Title", "Contract Title", "Title"],
    sourceUrl: ["Ad URL", "URL", "Link"],
    agency: ["Agency", "Agency Name"],
    solicitationNumber: ["CR Number", "Contract Reporter Number", "Ad Number"],
    postedDate: ["Ad Publish Date", "Issue Date", "Publication Date"],
    responseDeadline: ["Due Date", "Proposal Due Date", "Bid Due Date"],
    description: ["Ad Description", "Description", "Summary"],
    location: ["Location", "County"],
  },
  textPatterns: {
    solicitationNumber: [/CR Number\s*[:#-]\s*([A-Z0-9_.-]+)/i],
    postedDateLabels: ["publication date", "issue date"],
    deadlineLabels: ["due date", "proposal due date"],
  },
});
