import { createPortalParser } from "./generic";

export const parseNorthCarolinaEvp = createPortalParser({
  state: "NC",
  baseUrl: "https://evp.nc.gov/",
  fieldMap: {
    title: ["Solicitation Title", "Title", "Bid Title"],
    sourceUrl: ["Solicitation URL", "URL", "Link"],
    agency: ["Department", "Agency", "Purchasing Agency"],
    solicitationNumber: ["Solicitation Number", "Bid Number", "Event ID"],
    postedDate: ["Open Date", "Posted Date", "Issue Date"],
    responseDeadline: ["Due Date", "Closing Date", "Bid Opening Date"],
    description: ["Description", "Summary"],
  },
  textPatterns: {
    solicitationNumber: [/Solicitation Number\s*[:#-]\s*([A-Z0-9_.-]+)/i],
    postedDateLabels: ["open date", "posted date"],
    deadlineLabels: ["due date", "closing date"],
  },
});
