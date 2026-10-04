import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isServiceNameNotBuyer } from "../profileServiceName";

describe("service name posing as buyer", () => {
  it("recognises profile service phrases and category labels, not real buyers", () => {
    assert.equal(isServiceNameNotBuyer("Occupational Health"), true);
    assert.equal(isServiceNameNotBuyer("medical surveillance"), true);
    assert.equal(isServiceNameNotBuyer("Hearing conservation / audiometry"), true);
    assert.equal(isServiceNameNotBuyer("Fresno County Department of Public Health"), false);
    assert.equal(isServiceNameNotBuyer(""), false);
  });
});
