/**
 * The what-if model. Deliberately simple and transparent: the formula is shown
 * to the user on /about, so every term must be explainable in one sentence.
 *
 * Pure by design — it takes numbers, never data. `getSimulatableCompounds` in
 * ./data supplies the baseline `C0` and the current removal `r0`.
 *
 * Callers are expected to keep the sliders inside the ranges documented below.
 * Nothing here silently clamps: a value out of range produces the number that
 * value implies, so a UI bug cannot masquerade as a plausible result.
 */

/** Default share of a medicine's load arriving from improper disposal. */
export const DEFAULT_DISPOSAL_SHARE = 0.05;
/** Default share of wastewater reaching the stream untreated (overflows, misconnections). */
export const DEFAULT_UNTREATED_SHARE = 0.1;
/** Ceiling for the treatment slider: an advanced upgrade such as ozonation. */
export const TREATMENT_CEILING = 0.95;
/** `treatmentOnly` must beat `takeBackOnly` by this factor to be called dominant. */
export const TREATMENT_DOMINANCE_FACTOR = 3;

/** `d`: share of load from improper disposal. */
export const DISPOSAL_SHARE_RANGE = { min: 0, max: 0.3 } as const;
/** `a`: take-back adoption, the share of improper disposal that stops. */
export const ADOPTION_RANGE = { min: 0, max: 1 } as const;
/** `u`: share of wastewater reaching the stream untreated. */
export const UNTREATED_RANGE = { min: 0, max: 0.5 } as const;

export const VERDICT_TREATMENT_DOMINATES =
  "For this medicine, most of what reaches the stream passes through our bodies first. Returning pills helps a little; better treatment helps far more.";
export const VERDICT_DISPOSAL_MATTERS =
  "For this medicine, how we dispose of unused pills matters as much as treatment.";
export const VERDICT_BOTH_HELP =
  "Both actions help. Together they do the most.";

export type SimulateInput = {
  /** Baseline concentration at the stream, ng/L. */
  C0: number;
  /** Share of load from improper disposal, 0..0.30. */
  d: number;
  /** Take-back adoption, 0..1. */
  a: number;
  /** Share of wastewater reaching the stream untreated, 0..0.5. */
  u: number;
  /** Current removal at the plant, 0..1. */
  r0: number;
  /** Improved removal, r0..0.95. */
  r1: number;
};

export type Simulation = {
  /** Concentration after both changes, ng/L. */
  C1: number;
  /** Total reduction, as a percentage of C0. */
  reductionPercent: number;
  /** Effect of take-back alone, i.e. with r1 held at r0. */
  takeBackOnlyPercent: number;
  /** Effect of the treatment upgrade alone, i.e. with a held at 0. */
  treatmentOnlyPercent: number;
};

/** Share of a medicine that survives the plant and reaches the stream. */
export function passThrough(u: number, r: number): number {
  return u + (1 - u) * (1 - r);
}

/**
 * passThrough(r1) / passThrough(r0).
 *
 * The denominator is zero only when u is 0 and r0 is 1 — a plant that already
 * removes everything. There is nothing left for an upgrade to remove, so the
 * ratio is 1 rather than Infinity.
 */
function treatmentRatio(u: number, r0: number, r1: number): number {
  const baseline = passThrough(u, r0);
  if (baseline === 0) return 1;
  return passThrough(u, r1) / baseline;
}

/** A C0 of zero has no reduction to report; NaN would reach the UI, so use 0. */
function reductionPercent(from: number, to: number): number {
  if (from === 0) return 0;
  return (1 - to / from) * 100;
}

export function simulate(p: SimulateInput): Simulation {
  const { C0, d, a, u, r0, r1 } = p;

  const disposalFactor = 1 - d * a;
  const ratio = treatmentRatio(u, r0, r1);
  const C1 = C0 * disposalFactor * ratio;

  return {
    C1,
    reductionPercent: reductionPercent(C0, C1),
    takeBackOnlyPercent: reductionPercent(C0, C0 * disposalFactor),
    treatmentOnlyPercent: reductionPercent(C0, C0 * ratio),
  };
}

/**
 * Which of the two actions moves this medicine more.
 *
 * Note the branch order: with both effects at zero (no change yet, i.e. a = 0
 * and r1 = r0) this returns the disposal message, because `0 >= 0`. Callers
 * should show a "nothing changed yet" state instead of a verdict until one of
 * the two controls actually moves.
 */
export function verdict(takeBackOnly: number, treatmentOnly: number): string {
  if (treatmentOnly > TREATMENT_DOMINANCE_FACTOR * takeBackOnly) {
    return VERDICT_TREATMENT_DOMINATES;
  }
  if (takeBackOnly >= treatmentOnly) {
    return VERDICT_DISPOSAL_MATTERS;
  }
  return VERDICT_BOTH_HELP;
}
