# Calibration of relevance.accept_min / relevance.review_min

Corpus: `cases.json` (105 relevance cases). Scores come from the app's real `classifyResult` running on the Neon profile vocabulary (real application path: `api-server/src/lib/search/__tests__/neonProfileRegression.test.ts`; the old test-only adapter `run_regression.mts` was retired). Reproduce: `cd api-server && node --import tsx --test src/lib/search/__tests__/neonProfileRegression.test.ts src/lib/search/__tests__/consumerParity.test.ts`.

## Observed scores
- Legitimate notices passing the evidence rules: fresh weak-evidence cases [76, 79, 79, 79, 79, 79, 82, 84, 84, 84]; dated/stale-but-legit cases [72, 72]; fuller cases 84-100.
- Junk that the evidence rules reject but that still carries a score (classifier verdict `insufficient`): [(8, 'adv03'), (28, 'adv10'), (33, 'adv01'), (45, 'bwr02'), (45, 'bwr06'), (50, 'bwr01'), (53, 'adv02'), (53, 'adv04'), (53, 'adv05'), (58, 'oth09'), (59, 'adv06')]
- Thin-but-legitimate notices rejected by the evidence rules: [('wk03', 45), ('wk06', 57)]
- Junk decided by Neon rules (staffing, commodity, notices, out-of-scope, conditional penalties) never reaches a threshold.

## Sweep (rows: accept_min, columns: review_min). Cells: false_accepts / missed_legit_accepts / junk_sent_to_review / thin_legit_rejected

| accept_min \ review_min | 40 | 45 | 50 | 55 | 60 |
|---|---|---|---|---|---|
| 60 | 0/0/8/0 | 0/0/8/0 | 0/0/6/1 | 0/0/2/1 | - |
| 65 | 0/0/8/0 | 0/0/8/0 | 0/0/6/1 | 0/0/2/1 | 0/0/0/2 |
| 70 | 0/0/8/0 | 0/0/8/0 | 0/0/6/1 | 0/0/2/1 | 0/0/0/2 |
| 72 | 0/0/8/0 | 0/0/8/0 | 0/0/6/1 | 0/0/2/1 | 0/0/0/2 |
| 75 | 0/0/8/0 | 0/0/8/0 | 0/0/6/1 | 0/0/2/1 | 0/0/0/2 |
| 78 | 0/1/8/0 | 0/1/8/0 | 0/1/6/1 | 0/1/2/1 | 0/1/0/2 |
| 80 | 0/6/8/0 | 0/6/8/0 | 0/6/6/1 | 0/6/2/1 | 0/6/0/2 |
| 85 | 0/11/8/0 | 0/11/8/0 | 0/11/6/1 | 0/11/2/1 | 0/11/0/2 |

## Reading the table
- **False accepts are 0 at every value 60-85.** Discrimination is done by the Neon evidence/rule gates, not by the score cut-off; accept_min only separates auto-accept from adjudication for notices that already passed those gates.
- **accept_min:** every legitimate case is retained for any value <= 72 (the binding case is a legitimate 2022-dated notice scoring exactly 72). fresh weak-evidence notices score as low as 76, so >= 78 loses 1 and >= 80 loses 6. Chosen: **70** (same corpus outcome as 60-72, with a 2-point margin below the binding case).
- **review_min:** this is a cost/recall tradeoff, not a correctness boundary. 45 keeps both thin-but-legitimate cases and sends 8 junk cases to adjudication (judge calls, final decision reject); 55 sends 2 junk cases but drops a thin legitimate notice (score 45); 60 sends none but drops both. Chosen: **45**. The sample is small (2 thin legitimate cases) and the choice depends on how much adjudication volume is acceptable, so this value is flagged for owner confirmation.
- No value was kept just because it was an earlier default: the legacy 72/55 pair happens to sit inside the supported accept window but not at the review_min optimum for recall.
