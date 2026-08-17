import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { passesTangoOccumedPrecisionGate } from "../tango";

describe("Tango Occu-Med precision gate", () => {
  it("keeps core occupational-health scopes", () => {
    assert.equal(
      passesTangoOccumedPrecisionGate(
        "RFP for occupational health services including employee physical examinations, drug testing, audiograms, spirometry, and medical surveillance.",
      ),
      true,
    );
    assert.equal(
      passesTangoOccumedPrecisionGate(
        "NFPA 1582 firefighter medical examinations and annual fitness-for-duty services.",
      ),
      true,
    );
    assert.equal(
      passesTangoOccumedPrecisionGate(
        "Respirator medical evaluation and fit testing for public works employees under the respiratory protection program.",
      ),
      true,
    );
    assert.equal(
      passesTangoOccumedPrecisionGate(
        "Pre-employment physical examinations and DOT drug and alcohol testing for agency applicants and employees.",
      ),
      true,
    );
  });

  it("keeps generic clinical components only when tied to workforce context", () => {
    assert.equal(
      passesTangoOccumedPrecisionGate(
        "Audiometric testing, spirometry and vaccinations for employees assigned to hazardous worksites.",
      ),
      true,
    );
    assert.equal(
      passesTangoOccumedPrecisionGate(
        "TB testing and immunization services for contractor personnel before deployment.",
      ),
      true,
    );
  });

  it("rejects ordinary patient and community medical procurements", () => {
    assert.equal(
      passesTangoOccumedPrecisionGate(
        "Community vaccination services for residents and the general public.",
      ),
      false,
    );
    assert.equal(
      passesTangoOccumedPrecisionGate(
        "Hospital seeks laboratory testing and medical screening services for clinic patients.",
      ),
      false,
    );
    assert.equal(
      passesTangoOccumedPrecisionGate(
        "Student health TB testing and immunization program for university students.",
      ),
      false,
    );
  });

  it("rejects unrelated federal solicitations containing incidental medical words", () => {
    assert.equal(
      passesTangoOccumedPrecisionGate(
        "Construction contract. Contractor must maintain a drug testing policy for its own staff.",
      ),
      false,
    );
    assert.equal(
      passesTangoOccumedPrecisionGate(
        "IT support services. Personnel must complete a medical screening before receiving site access.",
      ),
      false,
    );
    assert.equal(
      passesTangoOccumedPrecisionGate(
        "Purchase of laboratory testing equipment and medical supplies.",
      ),
      false,
    );
  });
});
