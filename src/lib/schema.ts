import { z } from "zod";

/**
 * Evidence labels. Every number shown in the UI carries one of these.
 * - measured:   value taken from the study's own tables
 * - literature: value or parameter taken from another cited paper
 * - model:      value computed by our formula
 */
export const Evidence = z.enum(["measured", "literature", "model"]);

export const CityId = z.enum([
  "coimbra",
  "toulouse",
  "benevento",
  "ghent",
  "oslo",
]);

/** Detections may be city-specific or study-wide ("all"). */
export const DetectionCityId = z.union([CityId, z.literal("all")]);

export const City = z.object({
  id: CityId,
  name: z.string(),
  country: z.string(),
  sitesSampled: z.number().int().nullable(),
  // 1 = highest total concentration (Toulouse) ... 5 = lowest (Oslo)
  rankTotalConcentration: z.number().int().min(1).max(5),
  sourceId: z.string(),
});

export const Compound = z.object({
  id: z.string(),
  name: z.string(),
  therapeuticClass: z.string(),
  plainUse: z.string(),
  euWatchList: z.boolean(),
  isAntibiotic: z.boolean(),
  // what-if parameters; null = unknown, and the simulator hides the compound
  excretedUnchangedFraction: z.number().min(0).max(1).nullable(),
  wwtpRemoval: z.number().min(0).max(1).nullable(),
  paramSourceId: z.string().nullable(),
});

export const Detection = z.object({
  cityId: DetectionCityId,
  compoundId: z.string(),
  // share of sampled sites where the compound was detected
  detectionFrequency: z.number().min(0).max(1).nullable(),
  // concentration in ng/L; null means "not reported", never zero
  value: z.number().nullable(),
  unit: z.literal("ng/L"),
  statistic: z.enum(["median", "mean", "max", "min"]),
  evidence: Evidence,
  sourceId: z.string(),
});

export const Source = z.object({
  id: z.string(),
  citation: z.string(),
  url: z.string().url(),
  // optional, richer citation metadata
  title: z.string().optional(),
  authors: z.string().optional(),
  year: z.number().int().optional(),
  kind: z.enum(["paper", "policy-brief", "dataset", "report"]).optional(),
});

export const Cities = z.array(City);
export const Compounds = z.array(Compound);
export const Detections = z.array(Detection);
export const Sources = z.array(Source);

export type EvidenceLabel = z.infer<typeof Evidence>;
export type CityIdType = z.infer<typeof CityId>;
export type City = z.infer<typeof City>;
export type Compound = z.infer<typeof Compound>;
export type Detection = z.infer<typeof Detection>;
export type Source = z.infer<typeof Source>;
