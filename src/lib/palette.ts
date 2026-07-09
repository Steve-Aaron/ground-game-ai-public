/**
 * Canonical colour palettes for parties and news sources.
 *
 * Components must NOT inline hex codes or duplicate these maps.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Parties
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Canonical party identifiers used across the platform.
 *
 * Includes the short EC codes (CON, LAB, LIB, OTH) AND the friendlier display
 * forms (Reform, Reform UK, Conservative, Labour, Liberal Democrats, Green)
 * so existing data files keep working without rewrites.
 */
export type PartyKey =
  | "CON"
  | "LAB"
  | "LIB"
  | "Reform"
  | "Green"
  | "OTH"
  | "Conservative"
  | "Labour"
  | "Reform UK"
  | "Liberal Democrats"
  | "Liberal Democrat"
  | "SNP"
  | "NAT"
  | "Count Binface"
  | "Monster Raving Loony Party";

// Canonical hexes — mirrored as CSS variables (--party-*) in globals.css.
// Kept as hex here because maplibre paint expressions can't resolve CSS vars.
const PARTY_COLORS: Record<PartyKey, string> = {
  CON: "#0087DC",
  Conservative: "#0087DC",
  LAB: "#E4003B",
  Labour: "#E4003B",
  LIB: "#FF6400",
  "Liberal Democrats": "#FF6400",
  "Liberal Democrat": "#FF6400",
  Reform: "#1EB8D0",
  "Reform UK": "#1EB8D0",
  SNP: "#FDF38E",
  NAT: "#FDF38E",
  "Count Binface": "#FFF000",
  "Monster Raving Loony Party": "#FFF000",
  Green: "#6AB023",
  OTH: "#999999",
};

const PARTY_DEFAULT = "#999999";

/**
 * Lookup a party colour by name or EC code. Unknown values get a neutral grey.
 * Lookup is case-insensitive and tolerant of "Conservatives" / "Labour Party"
 * style variants via substring matching.
 */
export function partyColor(party: string | null | undefined): string {
  if (!party) return PARTY_DEFAULT;
  // Exact / mapped match first.
  const direct = (PARTY_COLORS as Record<string, string>)[party];
  if (direct) return direct;

  const n = party.toLowerCase();
  if (n.includes("conservative")) return PARTY_COLORS.CON;
  if (n.includes("labour")) return PARTY_COLORS.LAB;
  if (n.includes("reform")) return PARTY_COLORS.Reform;
  if (n.includes("liberal democrat") || n.includes("lib dem")) return PARTY_COLORS.LIB;
  if (n.includes("green")) return PARTY_COLORS.Green;
  if (n.includes("plaid")) return "#005B54";
  if (n.includes("snp") || n.includes("scottish national")) return "#FDF38E";
  return PARTY_DEFAULT;
}

/**
 * Friendly party label for display. Maps EC codes to long names; passes
 * through anything already long-form.
 */
export function partyLabel(party: string | null | undefined): string {
  if (!party) return "Other";
  const map: Record<string, string> = {
    CON: "Conservative",
    LAB: "Labour",
    LIB: "Liberal Democrats",
    Reform: "Reform UK",
    Green: "Green",
    OTH: "Other",
  };
  if (map[party]) return map[party];

  // Substring fallbacks for long-form party names from data sources.
  const n = party.toLowerCase();
  if (n.includes("conservative")) return "Conservative";
  if (n.includes("labour")) return "Labour";
  if (n.includes("reform")) return "Reform UK";
  if (n.includes("liberal democrat") || n.includes("lib dem")) return "Liberal Democrats";
  if (n.includes("plaid")) return "Plaid Cymru";
  if (n.includes("snp") || n.includes("scottish national")) return "SNP";
  if (n.includes("green")) return "Green";
  return party;
}

// ─────────────────────────────────────────────────────────────────────────────
// News sources (UK politics outlets shown in Headlines / Briefings)
// ─────────────────────────────────────────────────────────────────────────────

export type SourceKey =
  | "BBC"
  | "Sky News"
  | "Guardian"
  | "Politico"
  | "Telegraph"
  | "GB News";

export interface SourceStyle {
  bg: string;
  text: string;
}

const SOURCE_STYLES: Record<SourceKey, SourceStyle> = {
  BBC: { bg: "bg-red-600/20", text: "text-red-400" },
  "Sky News": { bg: "bg-sky-600/20", text: "text-sky-400" },
  Guardian: { bg: "bg-indigo-800/20", text: "text-indigo-300" },
  Politico: { bg: "bg-orange-600/20", text: "text-orange-400" },
  Telegraph: { bg: "bg-green-600/20", text: "text-green-400" },
  "GB News": { bg: "bg-red-700/20", text: "text-red-300" },
};

const SOURCE_DEFAULT: SourceStyle = {
  bg: "bg-zinc-700/20",
  text: "text-zinc-400",
};

/** Tailwind bg + text classes for a news source chip. */
export function sourceStyle(source: string | null | undefined): SourceStyle {
  if (!source) return SOURCE_DEFAULT;
  return (SOURCE_STYLES as Record<string, SourceStyle>)[source] ?? SOURCE_DEFAULT;
}

// ─────────────────────────────────────────────────────────────────────────────
// Electoral Calculus indicator cells
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map an EC indicator cell class (party, 5-step scale, or Tribe cluster) to
 * cell styling. Colours are CSS variables defined in globals.css so they can
 * be themed in one place. Returns null for unstyled cells.
 */
export function ecIndicatorStyle(
  cls: string
): { backgroundColor: string; color: string } | null {
  if (!cls) return null;
  const key = cls.toLowerCase();

  // Party cells (winner rows) — user-specified variable colours first,
  // anything else falls back to the canonical party palette.
  const partyVars: Record<string, string> = {
    lab: "var(--party-labour)",
    con: "var(--party-conservative)",
    lib: "var(--party-libdem)",
    reform: "var(--party-reform)",
    nat: "var(--party-snp)",
    loony: "var(--party-loony)",
    binface: "var(--party-loony)",
    green: "var(--party-green)",
    oth: "var(--party-other)",
    min: "var(--party-other)",
  };
  if (partyVars[key]) {
    return { backgroundColor: partyVars[key], color: WHITE_TEXT_CLASSES.has(key) ? "#fff" : "#111" };
  }

  // 5-step scales: economic1-5, census1-5, leaveshare1-5.
  const scaleMatch = key.match(/^(economic|census|leaveshare)([1-5])$/);
  if (scaleMatch) {
    return {
      backgroundColor: `var(--ec-${scaleMatch[1]}${scaleMatch[2]})`,
      color: WHITE_TEXT_CLASSES.has(key) ? "#fff" : "#111",
    };
  }

  // Tribe clusters — EC aliases some pairs to shared colours.
  const clusterAlias: Record<string, string> = {
    cluster_left: "left", cluster_right: "right", cluster_cent: "cent",
    cluster_trad: "trad", cluster_prog: "prog", cluster_hoff: "prog",
    cluster_kcap: "kcap", cluster_kyc: "kyc", cluster_pat: "kyc",
    cluster_nat: "nat", cluster_some: "nat",
  };
  if (clusterAlias[key]) {
    return {
      backgroundColor: `var(--ec-cluster-${clusterAlias[key]})`,
      color: WHITE_TEXT_CLASSES.has(key) ? "#fff" : "#111",
    };
  }

  return null;
}

// Saturated/dark backgrounds that need white text; everything else gets dark.
const WHITE_TEXT_CLASSES = new Set([
  "lab", "con", "lib",
  "economic1", "economic5",
  "census1",
  "leaveshare5",
  "cluster_left", "cluster_nat", "cluster_some",
]);

/**
 * Canonical party options for dropdowns (uploads, watch-lists). Single
 * source so selects can't drift apart.
 */
export const PARTY_OPTIONS = [
  "Reform UK",
  "Labour",
  "Conservative",
  "Liberal Democrats",
  "Green",
  "Restore Britain",
  "SNP",
  "Independent",
  "Other",
] as const;

/**
 * Party legend entries for map choropleths — palette-driven so the map can
 * never disagree with the rest of the platform. Hexes (not CSS vars)
 * because maplibre paint expressions can't resolve variables.
 */
export const PARTY_MAP_LEGEND: Array<{ party: string; color: string }> = [
  { party: "CON", color: partyColor("CON") },
  { party: "LAB", color: partyColor("LAB") },
  { party: "Reform", color: partyColor("Reform") },
  { party: "LIB", color: partyColor("LIB") },
  { party: "Green", color: partyColor("Green") },
  { party: "Other", color: "#666666" },
];
