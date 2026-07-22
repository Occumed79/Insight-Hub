export function mergeSummaryWithVerifiedFacts(ai: any, base: any, provider: string) {
  return {
    summary: typeof ai?.summary === "string" && ai.summary.trim() ? ai.summary.trim() : base.summary,
    occumedFit: typeof ai?.occumedFit === "string" ? ai.occumedFit.trim() || base.occumedFit : base.occumedFit,
    serviceLines: Array.isArray(ai?.serviceLines) && ai.serviceLines.length ? ai.serviceLines.filter((x: any) => typeof x === "string").slice(0, 5) : base.serviceLines,
    keyDates: base.keyDates,
    buyer: base.buyer,
    estimatedValue: base.estimatedValue,
    solicitationType: base.solicitationType,
    classification: base.classification,
    sourceUrl: base.sourceUrl,
    bidNotes: [`Decision status: ${base.fitVerdict}. Confidence: ${base.confidence}.`, ...(Array.isArray(ai?.bidNotes) ? ai.bidNotes : base.bidNotes)].filter((x: any) => typeof x === "string").slice(0, 5),
    missingInfo: Array.isArray(ai?.missingInfo) ? ai.missingInfo.filter((x: any) => typeof x === "string").slice(0, 6) : base.missingInfo,
    provider,
    fitVerdict: base.fitVerdict,
    confidence: base.confidence,
    evidenceFingerprint: base.evidenceFingerprint,
  };
}

