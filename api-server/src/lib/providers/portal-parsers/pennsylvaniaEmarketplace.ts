import { createPortalParser } from "./generic";

export const parsePennsylvaniaEmarketplace = createPortalParser({
  state: "PA",
  baseUrl: "https://www.emarketplace.state.pa.us/",
  fieldMap: {
    title: ["Solicitation Title", "Description", "Title"],
    sourceUrl: ["Solicitation URL", "URL", "Link"],
    agency: ["Agency", "Department", "Issuing Office"],
    solicitationNumber: ["Solicitation Number", "Bid Number", "Event Number"],
    postedDate: ["Advertisement Date", "Posted Date", "Issue Date"],
    responseDeadline: ["Bid Opening Date", "Due Date", "Closing Date"],
    description: ["Description", "Summary"],
  },
  textPatterns: {
    solicitationNumber: [/Solicitation Number\s*[:#-]\s*([A-Z0-9_.-]+)/i],
    postedDateLabels: ["advertisement date", "posted date"],
    deadlineLabels: ["bid opening date", "due date"],
  },
});
