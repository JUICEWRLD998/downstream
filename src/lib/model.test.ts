import { describe, expect, it } from "vitest";

import { cities, compounds, detections, getSimulatableCompounds } from "./data";
import {
  DEFAULT_DISPOSAL_SHARE,
  DEFAULT_UNTREATED_SHARE,
  TREATMENT_CEILING,
  VERDICT_BOTH_HELP,
  VERDICT_DISPOSAL_MATTERS,
  VERDICT_TREATMENT_DOMINATES,
  passThrough,
  simulate,
  verdict,
  type SimulateInput,
} from "./model";

/**
 * Phase 2 acceptance check.
 *
 * The five numbered tests are the ones the implementation plan requires; the
 * rest cover the edges the plan's inputs can actually reach. `toBeCloseTo`
 * compares the value the test exists to pin before the reasoning behind it, so
 * a regression reads as the number that moved.
 */

const BASE: SimulateInput = {
  C0: 1000,
  d: DEFAULT_DISPOSAL_SHARE,
  a: 0,
  u: DEFAULT_UNTREATED_SHARE,
  r0: 0.2,
  r1: 0.2,
};

describe("passThrough", () => {
  it("is the share that survives the plant and reaches the stream", () => {
    // u = 0: everything is treated, so only the removal fraction matters.
    expect(passThrough(0, 0)).toBe(1);
    expect(passThrough(0, 1)).toBe(0);
    // u = 1: nothing is treated, so removal cannot help.
    expect(passThrough(1, 0)).toBe(1);
    expect(passThrough(1, 1)).toBe(1);
  });

  it("adds the untreated bypass on top of what treatment misses", () => {
    // 10% bypasses, and 10% of the treated 90% survives: 0.1 + 0.9 * 0.1.
    expect(passThrough(0.1, 0.9)).toBeCloseTo(0.19, 12);
  });

  it("never increases as removal improves", () => {
    for (const u of [0, 0.1, 0.3, 0.5]) {
      let previous = Number.POSITIVE_INFINITY;
      for (let r = 0; r <= 1.0001; r += 0.05) {
        const current = passThrough(u, r);
        expect(current, `u=${u} r=${r}`).toBeLessThanOrEqual(previous);
        previous = current;
      }
    }
  });
});

describe("required behaviour", () => {
  it("1. a = 0 and r1 = r0 leaves the concentration unchanged", () => {
    const result = simulate({ ...BASE, a: 0, r1: BASE.r0 });
    expect(result.C1).toBe(BASE.C0);
    expect(result.reductionPercent).toBe(0);
    expect(result.takeBackOnlyPercent).toBe(0);
    expect(result.treatmentOnlyPercent).toBe(0);
  });

  it("2. d = 0.05, a = 1 and r1 = r0 cuts the load by the disposal share", () => {
    const result = simulate({ ...BASE, d: 0.05, a: 1, r1: BASE.r0 });
    expect(result.reductionPercent).toBeCloseTo(5, 10);
    // Perfect take-back is the whole 5%; the treatment upgrade adds nothing.
    expect(result.takeBackOnlyPercent).toBeCloseTo(5, 10);
    expect(result.treatmentOnlyPercent).toBeCloseTo(0, 10);
    expect(result.C1).toBeCloseTo(BASE.C0 * 0.95, 10);
  });

  it("3. with u = 0, the upgrade scales C0 by (1 - r1) / (1 - r0)", () => {
    const result = simulate({ ...BASE, a: 0, u: 0, r0: 0.1, r1: 0.9 });
    expect(result.C1).toBeCloseTo(BASE.C0 * (0.1 / 0.9), 10);
  });

  it("4. C1 stays between 0 and C0 across the whole slider grid", () => {
    const grid = { u: [0, 0.1, 0.25, 0.5], d: [0, 0.05, 0.3], a: [0, 0.5, 1] };
    const removals = [0, 0.1, 0.2, 0.4, 0.65, 0.97, 1];
    let cases = 0;

    for (const u of grid.u) {
      for (const d of grid.d) {
        for (const a of grid.a) {
          for (const r0 of removals) {
            const r1 = Math.max(r0, TREATMENT_CEILING);
            const result = simulate({ ...BASE, u, d, a, r0, r1 });
            const label = `u=${u} d=${d} a=${a} r0=${r0} r1=${r1}`;

            expect(Number.isFinite(result.C1), label).toBe(true);
            expect(result.C1, label).toBeGreaterThanOrEqual(0);
            expect(result.C1, label).toBeLessThanOrEqual(BASE.C0);
            for (const value of [
              result.reductionPercent,
              result.takeBackOnlyPercent,
              result.treatmentOnlyPercent,
            ]) {
              expect(Number.isFinite(value), label).toBe(true);
              expect(value, label).toBeGreaterThanOrEqual(0);
              expect(value, label).toBeLessThanOrEqual(100);
            }
            cases += 1;
          }
        }
      }
    }

    expect(cases).toBe(252);
  });

  it("5. returns each verdict branch for a matching input", () => {
    // Treatment dominates: near-total removal with a small disposal share.
    const treatment = simulate({
      ...BASE,
      d: 0.05,
      a: 1,
      u: 0,
      r0: 0.2,
      r1: 0.95,
    });
    expect(
      verdict(treatment.takeBackOnlyPercent, treatment.treatmentOnlyPercent),
    ).toBe(VERDICT_TREATMENT_DOMINATES);

    // Disposal at least matches treatment: poor removal, so the upgrade has
    // little to work with.
    const disposal = simulate({ ...BASE, d: 0.2, a: 1, u: 0.1, r0: 0.2, r1: 0.2 });
    expect(
      verdict(disposal.takeBackOnlyPercent, disposal.treatmentOnlyPercent),
    ).toBe(VERDICT_DISPOSAL_MATTERS);

    // Both move, neither dominates: 5% from take-back, about 11% from treatment.
    const both = simulate({ ...BASE, d: 0.05, a: 1, u: 0.1, r0: 0.2, r1: 0.3 });
    expect(both.takeBackOnlyPercent).toBeCloseTo(5, 10);
    expect(both.treatmentOnlyPercent).toBeGreaterThan(5);
    expect(verdict(both.takeBackOnlyPercent, both.treatmentOnlyPercent)).toBe(
      VERDICT_BOTH_HELP,
    );
  });
});

describe("edges the sliders can reach", () => {
  it("keeps a plant that already removes everything finite", () => {
    // u = 0 and r0 = 1 make passThrough(r0) zero. There is nothing left for an
    // upgrade to remove, so the ratio is 1 rather than Infinity.
    const result = simulate({ ...BASE, a: 0, u: 0, r0: 1, r1: 0.95 });
    expect(result.C1).toBe(BASE.C0);
    expect(result.treatmentOnlyPercent).toBe(0);
  });

  it("reports zero reduction when there is no baseline to reduce", () => {
    const result = simulate({ ...BASE, C0: 0, a: 1, r1: 0.95 });
    expect(result.C1).toBe(0);
    expect(result.reductionPercent).toBe(0);
    expect(Number.isNaN(result.reductionPercent)).toBe(false);
  });

  it("composes the two actions multiplicatively", () => {
    const result = simulate({ ...BASE, d: 0.05, a: 1, u: 0.1, r0: 0.2, r1: 0.8 });
    const remaining =
      (1 - result.takeBackOnlyPercent / 100) *
      (1 - result.treatmentOnlyPercent / 100);
    expect(result.C1).toBeCloseTo(BASE.C0 * remaining, 10);
  });

  it("does not clamp out-of-range input, so a UI bug cannot look plausible", () => {
    // r1 below r0 is not a reachable slider position. Clamping it up to r0 would
    // report "no change" and hide the bug; instead the ratio exceeds 1 and the
    // concentration rises, which is wrong in a way that shows up immediately.
    const result = simulate({ ...BASE, a: 0, u: 0.1, r0: 0.2, r1: 0.1 });
    expect(result.C1).toBeGreaterThan(BASE.C0);
  });
});

describe("verdict boundaries", () => {
  it("requires strictly more than 3x, not 3x, to call treatment dominant", () => {
    // At exactly 3x the dominance branch does not fire, and take-back does not
    // match treatment, so the honest message is that both help.
    expect(verdict(1, 3)).toBe(VERDICT_BOTH_HELP);
    expect(verdict(1, 3.0001)).toBe(VERDICT_TREATMENT_DOMINATES);
  });

  it("calls disposal at least as important when take-back is the larger effect", () => {
    expect(verdict(5, 1)).toBe(VERDICT_DISPOSAL_MATTERS);
  });

  it("returns the disposal message on a tie", () => {
    expect(verdict(4, 4)).toBe(VERDICT_DISPOSAL_MATTERS);
  });
});

describe("the simulator's real inputs", () => {
  it("runs on every compound the data layer offers, with a sane result", () => {
    const offered = cities.flatMap((city) =>
      getSimulatableCompounds(city.id).map((entry) => ({ city, entry })),
    );

    expect(
      offered.length,
      "no city offers anything to simulate",
    ).toBeGreaterThan(0);

    for (const { city, entry } of offered) {
      const C0 = entry.baseline.value;
      if (C0 === null) throw new Error("unreachable: data.ts filters nulls");
      const r0 = entry.compound.wwtpRemoval;
      if (r0 === null) throw new Error("unreachable: data.ts filters nulls");

      const result = simulate({
        C0,
        d: DEFAULT_DISPOSAL_SHARE,
        a: 0,
        u: DEFAULT_UNTREATED_SHARE,
        r0,
        r1: r0,
      });
      const label = `${city.id}/${entry.compound.id}`;
      expect(result.C1, label).toBe(C0);
      expect(Number.isFinite(result.reductionPercent), label).toBe(true);
    }
  });

  it("pins the current coverage, per city", () => {
    // A pinned map rather than a non-empty check: adding a compound here must be
    // a deliberate change with a new citation behind it, not a silent slide.
    // carbamazepine is the only compound with both a removal parameter and a
    // concentration the study reports, so it is what every city offers today.
    const actual = Object.fromEntries(
      cities.map((city) => [
        city.id,
        getSimulatableCompounds(city.id)
          .map((entry) => entry.compound.id)
          .sort(),
      ]),
    );

    expect(actual).toEqual({
      benevento: ["carbamazepine"],
      coimbra: ["carbamazepine"],
      ghent: ["carbamazepine"],
      oslo: ["carbamazepine"],
      toulouse: ["carbamazepine"],
    });
  });

  it("serves carbamazepine from the study-wide fallback, not a city figure", () => {
    // The 1,218 ng/L maximum is reported across all 102 sites, so the what-if
    // page must label it "Study-wide value (all 5 cities)" rather than implying
    // it was measured in the chosen city.
    for (const city of cities) {
      const [entry] = getSimulatableCompounds(city.id);
      expect(entry.compound.id, city.id).toBe("carbamazepine");
      expect(entry.scope, city.id).toBe("study-wide");
      expect(entry.baseline.value, city.id).toBe(1218);
    }
  });

  it("records the known coverage gap: four parameters, one usable baseline", () => {
    const parameterised = compounds
      .filter((c) => c.wwtpRemoval !== null && c.paramSourceId !== null)
      .map((c) => c.id)
      .sort();
    expect(parameterised).toEqual([
      "atenolol",
      "carbamazepine",
      "ciprofloxacin",
      "propranolol",
    ]);

    // Only carbamazepine has a concentration in the study. Two of the others
    // are detected in some cities with no value reported, and ciprofloxacin —
    // the required antibiotic — has no detection row at all. The simulator stays
    // silent about them rather than inventing a baseline.
    const withValue = parameterised.filter((id) =>
      detections.some((d) => d.compoundId === id && d.value !== null),
    );
    expect(withValue).toEqual(["carbamazepine"]);
    expect(
      detections.some((d) => d.compoundId === "ciprofloxacin"),
      "ciprofloxacin unexpectedly gained a baseline — revisit the coverage note",
    ).toBe(false);
  });
});
