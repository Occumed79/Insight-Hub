/**
 * OCCU_MED_AWARE central reference layer — public index.
 *
 * Usage:
 *   import { getOccuMedReference } from "../occumedAware";
 *   const ref = await getOccuMedReference();
 */

export type { OccuMedReferenceModel } from "./types";
export { isOccuMedAwareConfigured } from "./db";

import { buildOccuMedReferenceModel } from "./loader";
import type { OccuMedReferenceModel } from "./types";

const CACHE_TTL_MS = 15 * 60_000;
let _cached: OccuMedReferenceModel | null = null;
let _expiresAt = 0;
let _inflight: Promise<OccuMedReferenceModel> | null = null;

export async function getOccuMedReference(): Promise<OccuMedReferenceModel> {
  const now = Date.now();
  if (_cached && now < _expiresAt) return _cached;

  if (!_inflight) {
    _inflight = buildOccuMedReferenceModel()
      .then((model) => {
        _cached = model;
        _expiresAt = Date.now() + CACHE_TTL_MS;
        _inflight = null;
        return model;
      })
      .catch((err: unknown) => {
        _inflight = null;
        if (_cached) return _cached;
        throw err;
      });
  }

  if (_cached) return _cached;
  return _inflight;
}

export function invalidateOccuMedReferenceCache(): void {
  _cached = null;
  _expiresAt = 0;
  _inflight = null;
}
