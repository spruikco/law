import { z } from "zod";

/**
 * Australian state and territory codes.
 *
 * The product is built VIC-first. Other jurisdictions are scaffolded so that
 * rule packs and legislation corpora can be added without touching the
 * pipeline core. When a module adds NSW/QLD/etc. support, set
 * `jurisdiction` on the review and load the corresponding rule pack.
 */
export const Jurisdiction = z.enum([
  "VIC",
  "NSW",
  "QLD",
  "WA",
  "SA",
  "ACT",
  "TAS",
  "NT",
]);
export type Jurisdiction = z.infer<typeof Jurisdiction>;

export const JURISDICTION_LABELS: Record<Jurisdiction, string> = {
  VIC: "Victoria",
  NSW: "New South Wales",
  QLD: "Queensland",
  WA: "Western Australia",
  SA: "South Australia",
  ACT: "Australian Capital Territory",
  TAS: "Tasmania",
  NT: "Northern Territory",
};

/**
 * Implementation status for each jurisdiction × module combination.
 * "supported" = production-ready rules + corpus
 * "beta"      = rules drafted, not lawyer-verified
 * "stub"      = scaffold only, falls back to VIC patterns
 */
export const JurisdictionSupport = z.enum(["supported", "beta", "stub"]);
export type JurisdictionSupport = z.infer<typeof JurisdictionSupport>;
