import { createPortalParser } from "./generic";

export const parseSamGov = createPortalParser({
  baseUrl: "https://sam.gov/",
  fieldMap: {
    title: ["title", "noticeTitle"],
    sourceUrl: ["uiLink", "samLink", "link", "url"],
    agency: ["fullParentPathName", "department", "subTier", "office", "organizationName"],
    solicitationNumber: ["solicitationNumber", "noticeId", "oppId"],
    postedDate: ["postedDate", "publishDate", "createdDate"],
    responseDeadline: ["responseDeadLine", "responseDeadline", "archiveDate", "offerDueDate"],
    description: ["description", "descriptionText", "synopsis"],
    location: ["placeOfPerformance", "placeOfPerformanceState"],
  },
  textPatterns: {
    sourceUrl: [/((?:https?:\/\/)?sam\.gov\/opp\/[A-Za-z0-9_-]+\/view)/i],
    agency: [/Department\/Ind\. Agency\s*[:#-]\s*(.+)/i, /Office\s*[:#-]\s*(.+)/i],
    solicitationNumber: [/Notice ID\s*[:#-]\s*([A-Z0-9_.-]+)/i, /Solicitation Number\s*[:#-]\s*([A-Z0-9_.-]+)/i],
    postedDateLabels: ["published date", "posted date"],
    deadlineLabels: ["response date", "response deadline", "offers due"],
    description: [/Description\s*[:#-]\s*(.+)/i],
  },
});
