import { NextResponse } from "next/server";
import { requireUser } from "@/lib/guards";

export const dynamic = "force-dynamic";

// Resolves Sky News' CURRENT live YouTube video id by reading their /live
// page server-side (client fetches are CORS-blocked). Live stream ids rotate
// whenever the broadcast restarts, which is why hardcoded embed ids die —
// this resolver keeps the embed permanently fresh. Result cached 30 min.

const LIVE_PAGE = "https://www.youtube.com/@SkyNews/live";

export async function GET(request: Request) {
  const guard = await requireUser(request);
  if (guard instanceof NextResponse) return guard;

  const res = await fetch(LIVE_PAGE, {
    next: { revalidate: 1800 },
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      "Accept-Language": "en-GB,en;q=0.9",
    },
  });
  if (!res.ok) {
    return NextResponse.json(
      { error: `YouTube returned ${res.status}` },
      { status: 502 }
    );
  }

  const html = await res.text();
  const videoId =
    html.match(/"videoId"\s*:\s*"([\w-]{11})"/)?.[1] ??
    html.match(/watch\?v=([\w-]{11})/)?.[1] ??
    null;

  if (!videoId) {
    return NextResponse.json(
      { error: "No live stream found on the Sky News channel" },
      { status: 404 }
    );
  }

  return NextResponse.json({ videoId });
}
