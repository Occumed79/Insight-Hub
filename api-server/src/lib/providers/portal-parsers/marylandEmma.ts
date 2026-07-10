import { createPortalParser } from "./generic";

export const parseMarylandEmma = createPortalParser({
  state: "MD",
  baseUrl: "https://emma.maryland.gov/",
  fieldMap: {
    title: ["Solicitation Title", "Project Title", "Title"],
    sourceUrl: ["Solicitation URL", "URL", "Link"],
    agency: ["Issuing Agency", "Agency", "Department"],
    solicitationNumber: ["Solicitation ID", "Bid Number", "Project ID"],
    postedDate: ["Publication Date", "Posted Date", "Issue Date"],
    responseDeadline: ["Due Date", "Bid Opening Date", "Closing Date"],
    description: ["Summary", "Description"],
  },
  textPatterns: {
    solicitationNumber: [/Solicitation ID\s*[:#-]\s*([A-Z0-9_.-]+)/i],
    postedDateLabels: ["publication date", "posted date"],
    deadlineLabels: ["bid opening date", "due date"],
  },
});
