import { describe, expect, it } from "vitest";

import citiesJson from "../../data/cities.json";
import compoundsJson from "../../data/compounds.json";
import detectionsJson from "../../data/detections.json";
import sourcesJson from "../../data/sources.json";

import {
  Cities,
  Compounds,
  Detections,
  Sources,
  type City,
  type Compound,
  type Detection,
  type Source,
} from "./schema";

/**
 * Phase 1 acceptance check.
 *
 * Parsing is the first test: a data file that does not satisfy its schema fails
 * here rather than shipping a wrong number to the UI. The rest are referential
 * integrity checks — the thing a per-file schema cannot see.
 */

const cities: City[] = Cities.parse(citiesJson);
const compounds: Compound[] = Compounds.parse(compoundsJson);
const detections: Detection[] = Detections.parse(detectionsJson);
const sources: Source[] = Sources.parse(sourcesJson);

const sourceIds = new Set(sources.map((s) => s.id));
const compoundIds = new Set(compounds.map((c) => c.id));
const cityIds = new Set(cities.map((c) => c.id));

describe("data files parse against their schemas", () => {
  it("parses every file", () => {
    expect(cities.length).toBeGreaterThan(0);
    expect(compounds.length).toBeGreaterThan(0);
    expect(detections.length).toBeGreaterThan(0);
    expect(sources.length).toBeGreaterThan(0);
  });

  it("reports the compound count so a mismatch is visible", () => {
    // The study reports 16 pharmaceuticals across 6 therapeutic classes.
    // If this differs, the extraction and the paper disagree — investigate.
    expect(compounds.length).toBe(16);
  });
});

describe("cities", () => {
  it("has the five OneAquaHealth cities", () => {
    expect([...cityIds].sort()).toEqual([
      "benevento",
      "coimbra",
      "ghent",
      "oslo",
      "toulouse",
    ]);
  });

  it("assigns each total-concentration rank exactly once", () => {
    const ranks = cities.map((c) => c.rankTotalConcentration).sort();
    expect(ranks).toEqual([1, 2, 3, 4, 5]);
  });

  it("ranks Toulouse first and Oslo last, as the study reports", () => {
    const byId = new Map(cities.map((c) => [c.id, c]));
    expect(byId.get("toulouse")?.rankTotalConcentration).toBe(1);
    expect(byId.get("oslo")?.rankTotalConcentration).toBe(5);
  });
});

describe("referential integrity", () => {
  it("resolves every sourceId in cities", () => {
    for (const city of cities) {
      expect(sourceIds, `city ${city.id}`).toContain(city.sourceId);
    }
  });

  it("resolves every paramSourceId in compounds", () => {
    for (const compound of compounds) {
      if (compound.paramSourceId !== null) {
        expect(sourceIds, `compound ${compound.id}`).toContain(
          compound.paramSourceId,
        );
      }
    }
  });

  it("resolves every sourceId in detections", () => {
    for (const detection of detections) {
      expect(
        sourceIds,
        `detection ${detection.cityId}/${detection.compoundId}`,
      ).toContain(detection.sourceId);
    }
  });

  it("resolves every compoundId in detections", () => {
    for (const detection of detections) {
      // Group rows aggregate a whole therapeutic class, which the study reports
      // as a single figure; they are not compounds and are checked separately.
      if (detection.compoundId.startsWith("group-")) continue;
      expect(compoundIds, `detection ${detection.compoundId}`).toContain(
        detection.compoundId,
      );
    }
  });

  it("uses only the six known therapeutic-group ids for group rows", () => {
    const groups = [
      "group-antibiotic",
      "group-anticonvulsant",
      "group-antihypertensive",
      "group-analgesic",
      "group-lipid-regulator",
      "group-psychopharmaceutical",
    ];
    for (const detection of detections) {
      if (!detection.compoundId.startsWith("group-")) continue;
      expect(groups, `group row ${detection.compoundId}`).toContain(
        detection.compoundId,
      );
    }
  });

  it("uses a known city id or the study-wide marker in detections", () => {
    for (const detection of detections) {
      expect(
        detection.cityId === "all" || cityIds.has(detection.cityId),
        `detection cityId ${detection.cityId}`,
      ).toBe(true);
    }
  });

  it("offers no duplicate city/compound/statistic triple", () => {
    const seen = new Set<string>();
    for (const detection of detections) {
      const key = `${detection.cityId}|${detection.compoundId}|${detection.statistic}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
    }
  });
});

describe("provenance", () => {
  it("cites the study", () => {
    const hasPaper = sources.some((s) =>
      s.url.includes("10.1016/j.jhazmat.2025.139946"),
    );
    expect(hasPaper, "sources.json must cite Rodrigues et al. 2025").toBe(true);
  });

  it("cites the OneAquaHealth policy brief", () => {
    const hasBrief = sources.some((s) => s.url.includes("22025388"));
    expect(hasBrief, "sources.json must cite the policy brief").toBe(true);
  });

  it("gives every source a reachable-looking https url", () => {
    for (const source of sources) {
      expect(source.url, source.id).toMatch(/^https?:\/\//);
    }
  });

  it("never reports a concentration without a citation", () => {
    for (const detection of detections) {
      if (detection.value !== null) {
        expect(
          detection.sourceId.length > 0,
          `${detection.cityId}/${detection.compoundId} has a value but no source`,
        ).toBe(true);
      }
    }
  });
});

describe("what-if parameters (Phase 2 input)", () => {
  const parameterised = compounds.filter(
    (c) => c.wwtpRemoval !== null && c.paramSourceId !== null,
  );

  it("parameterises at least four compounds", () => {
    expect(
      parameterised.length,
      `only parameterised: ${parameterised.map((c) => c.id).join(", ") || "none"}`,
    ).toBeGreaterThanOrEqual(4);
  });

  it("includes carbamazepine, which passes through treatment poorly", () => {
    const carbamazepine = compounds.find((c) => c.id === "carbamazepine");
    expect(carbamazepine?.wwtpRemoval).not.toBeNull();
    expect(carbamazepine?.paramSourceId).not.toBeNull();
  });

  it("includes at least one antibiotic", () => {
    const withParams = parameterised.filter((c) => c.isAntibiotic);
    expect(
      withParams.length,
      "no antibiotic has what-if parameters",
    ).toBeGreaterThanOrEqual(1);
  });

  it("keeps every parameter inside 0..1", () => {
    for (const compound of compounds) {
      if (compound.wwtpRemoval !== null) {
        expect(compound.wwtpRemoval, compound.id).toBeGreaterThanOrEqual(0);
        expect(compound.wwtpRemoval, compound.id).toBeLessThanOrEqual(1);
      }
      if (compound.excretedUnchangedFraction !== null) {
        expect(
          compound.excretedUnchangedFraction,
          compound.id,
        ).toBeGreaterThanOrEqual(0);
        expect(
          compound.excretedUnchangedFraction,
          compound.id,
        ).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("known study findings are present", () => {
  it("flags the three EU Watch List substances that were detected", () => {
    for (const id of ["ofloxacin", "propranolol", "fluoxetine"]) {
      const compound = compounds.find((c) => c.id === id);
      expect(compound?.euWatchList, `${id} must be flagged EU Watch List`).toBe(
        true,
      );
    }
  });

  it("keeps detection frequencies as fractions", () => {
    for (const detection of detections) {
      if (detection.detectionFrequency !== null) {
        expect(detection.detectionFrequency, detection.compoundId).toBeGreaterThanOrEqual(0);
        expect(detection.detectionFrequency, detection.compoundId).toBeLessThanOrEqual(1);
      }
    }
  });
});
