export interface PortalParseInput {
  sourceId: string;
  data: unknown;
  baseUrl?: string;
}

export interface PortalCandidateOpportunity {
  title?: string;
  sourceUrl?: string;
  agency?: string;
  solicitationNumber?: string;
  postedDate?: Date;
  responseDeadline?: Date;
  description?: string;
  location?: string;
  state?: string;
  portalSourceId: string;
  raw?: unknown;
}

export type PortalParser = (input: PortalParseInput) => PortalCandidateOpportunity[];
