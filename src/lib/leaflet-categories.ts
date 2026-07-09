// Campaign-material content categories — shared by /api/leaflets and
// LeafletsPanel so the two can never drift.
export const LEAFLET_CATEGORIES = [
  "NHS & Health",
  "Immigration",
  "Economy & Cost of Living",
  "Crime & Policing",
  "Housing & Planning",
  "Environment",
  "Education",
  "Local Services",
  "Candidate Promotion",
  "Attack / Negative",
  "Other",
] as const;

export type LeafletCategory = (typeof LEAFLET_CATEGORIES)[number];
