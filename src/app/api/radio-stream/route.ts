import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guards";

export const dynamic = "force-dynamic";

// Resolves the current HLS URL for a BBC radio station via the BBC media
// selector. BBC's akamaized pool URLs rotate (the old hardcoded pool_904
// URL now returns 410 Gone), so the client asks this route for a fresh URL
// at play time. The media selector is not CORS-open, hence server-side.

const ALLOWED_STATIONS = new Set(["bbc_radio_five_live"]);

interface MediaSelectorResponse {
  media?: Array<{
    connection?: Array<{
      protocol?: string;
      transferFormat?: string;
      href?: string;
    }>;
  }>;
}

export async function GET(request: Request) {
  const guard = await requireUser(request);
  if (guard instanceof NextResponse) return guard;

  const { searchParams } = new URL(request.url);
  const station = searchParams.get("station") ?? "";
  if (!ALLOWED_STATIONS.has(station)) {
    return NextResponse.json({ error: "Unknown station" }, { status: 400 });
  }

  const url = `https://open.live.bbc.co.uk/mediaselector/6/select/version/2.0/mediaset/pc/vpid/${station}/format/json`;
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) {
    return NextResponse.json(
      { error: `BBC media selector returned ${res.status}` },
      { status: 502 }
    );
  }

  const data = (await res.json()) as MediaSelectorResponse;
  const href = data.media
    ?.flatMap((m) => m.connection ?? [])
    .find((c) => c.transferFormat === "hls" && c.protocol === "https")?.href;

  if (!href) {
    return NextResponse.json(
      { error: "No HLS stream in media selector response" },
      { status: 502 }
    );
  }

  return NextResponse.json({ url: href });
}
