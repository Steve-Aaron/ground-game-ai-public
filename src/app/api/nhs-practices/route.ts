// NHS Organisation Data Service (ODS) — GP practices and pharmacies
// inside a constituency's LADs. Free, no key required.
// Docs: https://digital.nhs.uk/services/organisation-data-service
//
// ODS does not expose a constituency filter, so we query by each LAD code
// the constituency overlaps and de-duplicate. The role codes we want:
//   RO76  = GP Practice
//   RO177 = Pharmacy
//   RO197 = Dental Practice

import { NextResponse, type NextRequest } from "next/server";
import { requireConstituencyAccess } from "@/lib/guards";
import { cached } from "@/lib/api-cache";
import { areaIds } from "@/lib/area-lookup";

export const dynamic = "force-dynamic";

const ODS_BASE = "https://directory.spineservices.nhs.uk/ORD/2-0-0/organisations";
const ROLE_LABELS: Record<string, "gp" | "pharmacy" | "dental"> = {
  RO76: "gp",
  RO177: "pharmacy",
  RO197: "dental",
};

interface OdsListItem {
  Name: string;
  OrgId: string;
  Status: string;
  OrgRecordClass: string;
  PostCode: string;
  PrimaryRoleId: string;
  PrimaryRoleDescription: string;
}

interface OdsListResponse {
  Organisations?: OdsListItem[];
}

export interface NHSPracticesData {
  counts: { gp: number; pharmacy: number; dental: number };
  practices: Array<{
    odsCode: string;
    name: string;
    type: "gp" | "pharmacy" | "dental";
    postcode: string;
    status: string;
  }>;
  source: string;
  sourceUrl: string;
}

async function fetchByLad(ladCode: string, roleId: string): Promise<OdsListItem[]> {
  const url = `${ODS_BASE}?PostCode=&PrimaryRoleId=${roleId}&NonPrimaryRoleId=&Status=Active&OrgRecordClass=RC1&LastChangeDate=&Limit=1000&Offset=0&LocalAuthority=${ladCode}`;
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 7 } });
  if (!res.ok) return [];
  const data = (await res.json()) as OdsListResponse;
  return data.Organisations ?? [];
}

async function buildFresh(ladCodes: string[]): Promise<NHSPracticesData | null> {
  if (ladCodes.length === 0) return null;

  const roleIds = Object.keys(ROLE_LABELS);
  const queries = ladCodes.flatMap((lad) => roleIds.map((role) => fetchByLad(lad, role)));
  const settled = await Promise.allSettled(queries);

  // De-duplicate by ODS code across LADs
  const seen = new Map<string, NHSPracticesData["practices"][number]>();
  for (const r of settled) {
    if (r.status !== "fulfilled") continue;
    for (const o of r.value) {
      if (seen.has(o.OrgId)) continue;
      const type = ROLE_LABELS[o.PrimaryRoleId];
      if (!type) continue;
      seen.set(o.OrgId, {
        odsCode: o.OrgId,
        name: o.Name,
        type,
        postcode: o.PostCode,
        status: o.Status,
      });
    }
  }

  const practices = Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  const counts = practices.reduce(
    (acc, p) => {
      acc[p.type] += 1;
      return acc;
    },
    { gp: 0, pharmacy: 0, dental: 0 },
  );

  return {
    counts,
    practices,
    source: "NHS Organisation Data Service",
    sourceUrl: "https://digital.nhs.uk/services/organisation-data-service",
  };
}

export async function GET(req: NextRequest) {
  const guard = await requireConstituencyAccess(req);
  if (guard instanceof Response) return guard;
  const { slug } = guard;

  const ids = areaIds(slug);
  if (!ids) return NextResponse.json({ error: "Unknown constituency" }, { status: 404 });

  const data = await cached(
    { route: "nhs-practices", key: slug },
    7 * 24 * 60 * 60 * 1000,
    () => buildFresh(ids.ladCodes),
  );

  if (!data) {
    return NextResponse.json({ error: "No NHS ODS data available" }, { status: 502 });
  }
  return NextResponse.json(data);
}
