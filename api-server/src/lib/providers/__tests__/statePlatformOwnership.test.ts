import assert from "node:assert/strict";
import test from "node:test";
import type { DataSourceProvider } from "../types";
import {
  KansasPeopleSoftChallengeAwareProvider,
  kansasPeopleSoftProvider,
} from "../kansasPeopleSoftProvider";
import {
  PEOPLE_SOFT_SOURCES,
  PEOPLESOFT_TENANTS,
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

test("Kansas has one challenge-aware runtime owner around the canonical PeopleSoft provider", () => {
  assert.equal(stateAvailabilityProviders["ks-esupplier"], undefined);
  assert.equal(
    stateAvailabilitySources.some((source) => source.id === "ks-esupplier"),
    false,
  );
  assert.equal(
    statePlatformAdapterProviders["ks-esupplier"],
    kansasPeopleSoftProvider,
  );
  assert.equal(
    kansasPeopleSoftProvider.baseProvider,
    peopleSoftPublicProviders["ks-esupplier"],
  );

  const canonicalSource = PEOPLE_SOFT_SOURCES.find(
    (source) => source.id === "ks-esupplier",
  );
  const publishedSource = STATE_PLATFORM_ADAPTER_SOURCES.find(
    (source) => source.id === "ks-esupplier",
  );
  const kansasTenant = PEOPLESOFT_TENANTS.find(
    (tenant) => tenant.portalId === "ks-esupplier",
  );
  assert.ok(canonicalSource);
  assert.ok(publishedSource);
  assert.ok(kansasTenant);
  assert.equal(publishedSource.sourceUrl, canonicalSource.sourceUrl);
  assert.doesNotMatch(publishedSource.sourceUrl, /\.GBL2(?:\?|$)/i);
  assert.match(publishedSource.sourceUrl, /SCP_PUB_BID_CMP_FL\.GBL\?/i);

  const recoveryRoutes = kansasTenant.alternateListingUrls ?? [];
  assert.equal(
    recoveryRoutes.some((url) => /\.GBL2(?:\?|$)/i.test(url)),
    false,
  );
  assert.equal(recoveryRoutes.some((url) => /\.GBL7\?/i.test(url)), true);
  assert.equal(recoveryRoutes.some((url) => /\.GBL9\?/i.test(url)), true);
});

test("Kansas challenge wrapper reclassifies only a live-confirmed browser/session gate", async () => {
  const base: DataSourceProvider = {
    name: "publicPortalProviders",
    async isConfigured() {
      return true;
    },
    async fetch() {
      return {
        records: [],
        total: 0,
        errors: [
          "ks-esupplier: PeopleSoft public routes returned no parseable opportunity rows",
        ],
      };
    },
    async getStatus() {
      return {
        name: "publicPortalProviders",
        configured: true,
        healthy: false,
      };
    },
  };

  const challenged = new KansasPeopleSoftChallengeAwareProvider(
    base,
    async () => ({
      challenged: true,
      finalUrl:
        "https://supplier.sok.ks.gov/psc/sokfsprdsup/SUPPLIER/ERP/c/SCP_PUBLIC_MENU_FL.SCP_PUB_BID_CMP_FL.GBL?PAGE=SCP_PUB_BIDLIST_FL&cmd=login&errorCode=999&languageCd=ENG",
    }),
  );
  const blocked = await challenged.fetch({ limit: 2 });
  assert.equal(blocked.records.length, 0);
  assert.match(blocked.errors[0] ?? "", /browser\/login challenge/i);
  assert.match(blocked.errors[0] ?? "", /errorCode=999/i);

  const notChallenged = new KansasPeopleSoftChallengeAwareProvider(
    base,
    async () => ({ challenged: false }),
  );
  const parserFailure = await notChallenged.fetch({ limit: 2 });
  assert.match(parserFailure.errors[0] ?? "", /no parseable opportunity rows/i);
  assert.doesNotMatch(parserFailure.errors[0] ?? "", /browser\/login challenge/i);
});
