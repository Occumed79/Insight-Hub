import type { PortalParser } from "./types";
import { parseCaliforniaCalEprocure } from "./californiaCalEprocure";
import { parseFloridaMfmp } from "./floridaMfmp";
import { parseMarylandEmma } from "./marylandEmma";
import { parseMichiganSigma } from "./michiganSigma";
import { parseNewYorkContractReporter } from "./nyContractReporter";
import { parseNorthCarolinaEvp } from "./northCarolinaEvp";
import { parseOhioProcurement } from "./ohioProcurement";
import { parsePennsylvaniaEmarketplace } from "./pennsylvaniaEmarketplace";
import { parseSamGov } from "./samGov";
import { parseTexasEsbd } from "./texasEsbd";
import { parseVirginiaEva } from "./virginiaEva";

export const PORTAL_PARSER_REGISTRY: Record<string, PortalParser> = {
  "us-sam-gov": parseSamGov,
  "ca-caleprocure": parseCaliforniaCalEprocure,
  "tx-esbd": parseTexasEsbd,
  "ny-contract-reporter": parseNewYorkContractReporter,
  "fl-vbs": parseFloridaMfmp,
  "pa-emarketplace": parsePennsylvaniaEmarketplace,
  "va-eva": parseVirginiaEva,
  "oh-ohiobuys": parseOhioProcurement,
  "mi-sigma": parseMichiganSigma,
  "md-emma": parseMarylandEmma,
  "nc-evp": parseNorthCarolinaEvp,
};

export function parserForPortalSource(sourceId?: string): PortalParser | undefined {
  return sourceId ? PORTAL_PARSER_REGISTRY[sourceId] : undefined;
}

export type { PortalCandidateOpportunity, PortalParseInput, PortalParser } from "./types";
