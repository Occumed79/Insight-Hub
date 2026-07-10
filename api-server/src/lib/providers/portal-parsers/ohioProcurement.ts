import { createPortalParser } from "./generic";

export const parseOhioProcurement = createPortalParser({
  state: "OH",
  baseUrl: "https://procure.ohio.gov/",
  fieldMap: {
    title: ["Procurement Title", "Opportunity Name", "Title"],
    sourceUrl: ["Opportunity URL", "URL", "Link"],
    agency: ["Agency", "Department"],
    solicitationNumber: ["Opportunity Number", "Solicitation Number", "Document Number"],
    postedDate: ["Posted Date", "Publish Date"],
    responseDeadline: ["Inquiry End Date", "Opening Date", "Due Date", "Closing Date"],
    description: ["Description", "Summary"],
  },
  textPatterns: {
    solicitationNumber: [/(?:Opportunity|Solicitation|Document) Number\s*[:#-]\s*([A-Z0-9_.-]+)/i],
    deadlineLabels: ["opening date", "inquiry end date", "due date"],
  },
});
