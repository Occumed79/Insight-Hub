// ── FEC Intelligence Types ─────────────────────────────────────────────────────

export interface FecCommittee {
  id: string;
  name: string;
  type: string;
  state?: string;
  treasurer?: string;
  firstFileDate?: string;
  lastFileDate?: string;
  cycles?: number[];
}

export interface FecCycleTotals {
  cycle: number;
  receipts: number;
  disbursements: number;
  contributions: number;
}

export interface FecPartySplit {
  party: string;
  amount: number;
  pct: number;
}

export interface FecDisbursement {
  date?: string;
  recipient?: string;
  amount?: number;
  description?: string;
}

export interface FecAllCommittee {
  id: string;
  name: string;
  type: string;
  active?: string;
}

export interface FecIntelligence {
  configured: true;
  committee?: FecCommittee;
  allCommittees?: FecAllCommittee[];
  totalReceipts: number;
  totalDisbursements: number;
  cycles: FecCycleTotals[];
  partySplit: FecPartySplit[];
  recentDisbursements: FecDisbursement[];
}

export interface FecIntelligenceEmpty {
  configured: true;
  committee: null;
  allCommittees: [];
  totalReceipts: 0;
  totalDisbursements: 0;
  cycles: [];
  partySplit: [];
  recentDisbursements: [];
}

export type FecResponse = FecIntelligence | FecIntelligenceEmpty;

// ── OSHA Intelligence Types ────────────────────────────────────────────────────

export interface OshaInspection {
  id: string;
  establishment: string;
  title?: string;
  snippet?: string;
  sourceUrl?: string;
  isOshaGov?: boolean;
  openDate?: string | null;
  closeDate?: string | null;
  totalPenalty?: string | null;
  violations?: number | null;
  state?: string | null;
  city?: string | null;
}

export interface OshaConfigured {
  configured: true;
  inspections: OshaInspection[];
  total: number;
}

export interface OshaUnconfigured {
  configured: false;
  message: string;
  settingKey: string;
}

export type OshaResponse = OshaConfigured | OshaUnconfigured;

// ── Litigation / CourtListener Types ──────────────────────────────────────────

export interface LitigationCase {
  id: number;
  caseName?: string;
  court?: string;
  dateFiled?: string;
  dateTerminated?: string;
  status: "Active" | "Closed";
  docketNumber?: string;
  url?: string;
  cause?: string;
  jurisdictionType?: string;
  amountAtStake?: number | null;
}

export interface LitigationConfigured {
  configured: true;
  cases: LitigationCase[];
  total: number;
}

export interface LitigationUnconfigured {
  configured: false;
  message: string;
  settingKey: string;
}

export type LitigationResponse = LitigationConfigured | LitigationUnconfigured;

// ── Summary Types ─────────────────────────────────────────────────────────────

export interface IntelSummary {
  oshaConfigured: boolean;
  litigationConfigured: boolean;
  regulatoryFlaggedCount: number;
  activeLitigationCount: number;
}
