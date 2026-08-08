import assert from "node:assert/strict";
import test from "node:test";
import {
  PEOPLE_SOFT_SOURCES,
  peopleSoftPublicProviders,
} from "../peopleSoftPublic";
import {
  stateAvailabilityProviders,
  stateAvailabilitySources,
} from "../statePlatformAvailabilityRegistry";
import {
  STATE_PLATFORM_ADAPTER_SOURCES,
  statePlatformAdapterProviders,
} from "../statePlatformAdapters";

test("Kansas has exactly one runtime owner and cannot be overridden by the retired GBL2 availability route", () => {
  assert.equal(stateAvailabilityProviders["ks-esupplier"], undefined);
  assert.equal(
    stateAvailabilitySources.some((source) => source.id === "ks-esupplier"),
    false,
  );
  assert.equal(
    statePlatformAdapterProviders["ks-esupplier"],
    peopleSoftPublicProviders["ks-esupplier"],
  );

  const canonicalSource = PEOPLE_SOFT_SOURCES.find(
    (source) => source.id === "ks-esupplier",
  );
  const publishedSource = STATE_PLATFORM_ADAPTER_SOURCES.find(
    (source) => source.id === "ks-esupplier",
  );
  assert.ok(canonicalSource);
  assert.ok(publishedSource);
  assert.equal(publishedSource.sourceUrl, canonicalSource.sourceUrl);
  assert.doesNotMatch(publishedSource.sourceUrl, /\.GBL2(?:\?|$)/i);
  assert.match(publishedSource.sourceUrl, /SCP_PUB_BID_CMP_FL\.GBL\?/i);
});
