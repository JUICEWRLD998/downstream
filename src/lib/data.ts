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
 * All data is validated at module load. If a data file is malformed or a
 * reference is dangling, this throws rather than rendering a wrong number.
 * `data.test.ts` is the gate that keeps it honest.
 */
export const cities: City[] = Cities.parse(citiesJson);
export const compounds: Compound[] = Compounds.parse(compoundsJson);
export const detections: Detection[] = Detections.parse(detectionsJson);
export const sources: Source[] = Sources.parse(sourcesJson);

/** Priority when several statistics exist for the same city and compound. */
const STATISTIC_PRIORITY: Detection["statistic"][] = [
  "median",
  "mean",
  "max",
  "min",
];

export function getCity(id: string): City | undefined {
  return cities.find((c) => c.id === id);
}

export function getCompound(id: string): Compound | undefined {
  return compounds.find((c) => c.id === id);
}

export function getSource(id: string): Source | undefined {
  return sources.find((s) => s.id === id);
}

export function getSourceUrl(id: string): string | undefined {
  return getSource(id)?.url;
}

export type DetectionScope = "city" | "study-wide";

export type ResolvedDetection = {
  detection: Detection;
  scope: DetectionScope;
};

function bestFor(cityId: string, compoundId: string): Detection | undefined {
  const matches = detections.filter(
    (d) => d.cityId === cityId && d.compoundId === compoundId,
  );
  if (matches.length === 0) return undefined;
  return matches.sort(
    (a, b) =>
      STATISTIC_PRIORITY.indexOf(a.statistic) -
      STATISTIC_PRIORITY.indexOf(b.statistic),
  )[0];
}

/**
 * A city-specific value wins. When the study reports only study-wide figures,
 * fall back to `cityId: "all"` and flag it so the UI can say so.
 */
export function resolveDetection(
  cityId: string,
  compoundId: string,
): ResolvedDetection | null {
  const city = bestFor(cityId, compoundId);
  if (city) return { detection: city, scope: "city" };
  const all = bestFor("all", compoundId);
  if (all) return { detection: all, scope: "study-wide" };
  return null;
}

export type CompoundRow = {
  compound: Compound;
  detection: Detection | null;
  scope: DetectionScope | null;
};

/** Compounds for a city's page, most frequently detected first. */
export function getCompoundRows(cityId: string): CompoundRow[] {
  return compounds
    .map((compound) => {
      const resolved = resolveDetection(cityId, compound.id);
      return {
        compound,
        detection: resolved?.detection ?? null,
        scope: resolved?.scope ?? null,
      };
    })
    .filter((row) => row.detection !== null)
    .sort(
      (a, b) =>
        (b.detection?.detectionFrequency ?? -1) -
        (a.detection?.detectionFrequency ?? -1),
    );
}

/**
 * Compounds the what-if simulator may offer: it needs a baseline concentration,
 * a removal fraction, and the citation for that fraction. Anything missing is
 * excluded rather than guessed.
 */
export type SimulatableCompound = {
  compound: Compound;
  baseline: Detection;
  scope: DetectionScope;
};

export function getSimulatableCompounds(cityId: string): SimulatableCompound[] {
  return compounds.flatMap((compound) => {
    if (compound.wwtpRemoval === null) return [];
    if (compound.paramSourceId === null) return [];
    const resolved = resolveDetection(cityId, compound.id);
    if (!resolved || resolved.detection.value === null) return [];
    return [
      {
        compound,
        baseline: resolved.detection,
        scope: resolved.scope,
      },
    ];
  });
}
