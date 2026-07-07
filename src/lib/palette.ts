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
  | "Liberal Democrat";

const PARTY_COLORS: Record<PartyKey, string> = {
  CON: "#0087DC",
  Conservative: "#0087DC",
  LAB: "#DC241f",
  Labour: "#DC241f",
  LIB: "#FAA61A",
  "Liberal Democrats": "#FAA61A",
  "Liberal Democrat": "#FAA61A",
  Reform: "#12B6CF",
  "Reform UK": "#12B6CF",
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
