// Canvassing session activity types — shared by the API route and the panel.
export const SESSION_TYPES = [
  "canvassing",
  "leafletting",
  "campaign stunt",
  "campaign stall",
  "fundraising event",
  "other",
] as const;

export type SessionType = (typeof SESSION_TYPES)[number];

/** Pin/badge colour per session type (hex — also used by maplibre markers). */
export const SESSION_TYPE_COLORS: Record<SessionType, string> = {
  canvassing: "#10b981",
  leafletting: "#38bdf8",
  "campaign stunt": "#f472b6",
  "campaign stall": "#fbbf24",
  "fundraising event": "#a78bfa",
  other: "#9ca3af",
};
