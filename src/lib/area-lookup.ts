// Constituency -> upstream-API identifier helpers.
//
// Routes used to reach into `getFullData(slug)` and pull `areas.lads[0].code`
// directly. That is brittle: every route ends up handling 'no LAD', 'two LADs',
// 'ward fallback' on its own. This module centralises the lookups so route
// handlers only ever see clean inputs.

import { getFullData } from "@/data";

export interface AreaIds {
  /** ONS Parliamentary Constituency code, e.g. 'E14001063' */
  onsCode: string;
  /** Stat-Xplore WPCA dimension value, e.g. '721420289'. Undefined for
   *  constituencies whose wpca24 has not yet been sourced. */
  wpca24Code: string | undefined;
  /** ONS Local Authority District codes covering the constituency */
  ladCodes: string[];
  /** NOMIS LAD geography codes for the same LADs */
  ladNomis: number[];
  /** Ward ONS codes inside the constituency */
  wardCodes: string[];
  /** ITL1 / former NUTS1 region as named in the data layer */
  region: string;
}

export function areaIds(slug: string): AreaIds | null {
  const d = getFullData(slug);
  if (!d) return null;
  const lads = d.areas?.lads ?? [];
  return {
    onsCode: d.constituency.onsCode,
    wpca24Code: d.constituency.wpca24Code,
    ladCodes: lads.map((l) => l.code),
    ladNomis: lads.map((l) => l.nomisCode).filter((n): n is number => typeof n === "number"),
    wardCodes: (d.areas?.wards ?? []).map((w) => w.code),
    region: d.constituency.region,
  };
}

/**
 * Extract postcode outcodes (the first half, e.g. 'CM7') from a list of
 * postcodes attached to wards. The repo does not yet ship per-ward
 * postcodes, so most callers should derive outcodes from one of the
 * postcode-aware data files in src/data — for now this helper is the seam
 * to plug that into later without touching every route.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function outcodesForConstituency(_slug: string): string[] {
  // TODO: when ward-postcode mapping lands, return the unique outcode set.
  return [];
}
