"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Play, Radio, Tv } from "lucide-react";
import VideoPlayer from "@/components/ui/VideoPlayer";
import PanelSkeleton from "@/components/ui/PanelSkeleton";

type ChannelKind = "hls" | "radio" | "youtube";

interface Channel {
  name: string;
  shortName: string;
  kind: ChannelKind;
  /** HLS manifest (kind: hls). */
  streamUrl?: string;
  /** Endpoint returning { url } — BBC radio URLs rotate (kind: radio). */
  resolveUrl?: string;
  /** YouTube video id (kind: youtube). */
  youtubeVideoId?: string;
  /** Official page, used as fallback when the stream fails. */
  directUrl: string;
  color: string;
  textColor: string;
  description: string;
}

// Stream sources verified July 2026 (see git history for the CORS/geo test
// results per CDN):
//  - BBC News/Parliament: official BBC simulcast HLS (UK-only, CORS-open)
//  - GB News: amagi FAST feed (CORS-open; simplestream blocks CORS)
//  - Sky News: skycdp HLS now returns 403 (token-protected) and no public
//    CORS-open HLS exists — YouTube embed is the reliable official source
//  - Radio 5 Live: BBC pool URLs rotate, resolved live via /api/radio-stream
const CHANNELS: Channel[] = [
  {
    name: "Sky News",
    shortName: "SKY",
    kind: "youtube",
    youtubeVideoId: "11Bog8oUYFk",
    directUrl: "https://news.sky.com/watch-live",
    color: "bg-sky-600/20",
    textColor: "text-sky-400",
    description: "Official YouTube live stream",
  },
  {
    name: "GB News",
    shortName: "GB",
    kind: "hls",
    streamUrl:
      "https://amg01076-lightning-amg01076c7-lg-gb-2019.playouts.now.amagi.tv/playlist/amg01076-lightning-gbnews-lggb/playlist.m3u8",
    directUrl: "https://www.gbnews.com/watch/live",
    color: "bg-red-600/20",
    textColor: "text-red-400",
    description: "Live IPTV stream",
  },
  {
    name: "BBC News",
    shortName: "BBC",
    kind: "hls",
    streamUrl:
      "https://vs-hls-push-uk-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_news_channel_hd/iptv_hd_abr_v1.m3u8",
    directUrl: "https://www.bbc.co.uk/iplayer/live/bbcnews",
    color: "bg-red-700/20",
    textColor: "text-red-300",
    description: "Live IPTV stream (UK only)",
  },
  {
    name: "BBC Parliament",
    shortName: "PARL",
    kind: "hls",
    streamUrl:
      "https://vs-hls-pushb-uk-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_parliament/pc_hd_abr_v2.m3u8",
    directUrl: "https://www.bbc.co.uk/iplayer/live/bbcparliament",
    color: "bg-purple-600/20",
    textColor: "text-purple-400",
    description: "Live IPTV stream (UK only)",
  },
  {
    name: "Radio 5 Live",
    shortName: "R5L",
    kind: "radio",
    resolveUrl: "/api/radio-stream?station=bbc_radio_five_live",
    directUrl: "https://www.bbc.co.uk/sounds/play/live:bbc_radio_five_live",
    color: "bg-yellow-600/20",
    textColor: "text-yellow-400",
    description: "Live IPTV audio stream",
  },
];

/** Radio needs its HLS URL resolved server-side first. */
function RadioPlayer({ channel, onFatalError }: { channel: Channel; onFatalError: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(channel.resolveUrl!)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { url: string }) => {
        if (!cancelled) setUrl(d.url);
      })
      .catch(() => {
        if (!cancelled) onFatalError();
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel.resolveUrl]);

  if (!url) return <PanelSkeleton variant="chart" rows={1} />;
  return <VideoPlayer src={url} kind="radio" title={channel.name} onFatalError={onFatalError} />;
}

function YouTubeEmbed({ channel }: { channel: Channel }) {
  return (
    <div data-component="youtubeEmbed" className="relative w-full" style={{ paddingBottom: "56.25%" }}>
      <iframe
        src={`https://www.youtube.com/embed/${channel.youtubeVideoId}?autoplay=1&mute=1&modestbranding=1&rel=0`}
        className="absolute inset-0 w-full h-full bg-black"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={`${channel.name} Live Stream`}
      />
    </div>
  );
}

/** Fallback card shown when a stream fails — links to the official page. */
function ChannelFallback({ channel }: { channel: Channel }) {
  const Icon = channel.kind === "radio" ? Radio : Tv;
  return (
    <div
      data-component="channelFallback"
      className="flex flex-col items-center justify-center py-10 bg-background/80"
    >
      <div className={`p-3 rounded-full ${channel.color} mb-3`}>
        <Icon className={`h-6 w-6 ${channel.textColor}`} />
      </div>
      <p className="text-xs text-zinc-400 mb-1 font-medium">{channel.name}</p>
      <p className="text-[0.611rem] text-zinc-600 mb-3">
        Stream unavailable — watch on the official site
      </p>
      <a
        href={channel.directUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-xs font-medium ${channel.color} ${channel.textColor} hover:brightness-125 transition-all`}
      >
        <Play className="h-3.5 w-3.5" />
        Watch Live
        <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

export default function LiveFeeds() {
  const [activeChannel, setActiveChannel] = useState(0);
  const [streamFailed, setStreamFailed] = useState<Record<string, boolean>>({});
  const channel = CHANNELS[activeChannel];

  const markFailed = (name: string) => () =>
    setStreamFailed((prev) => ({ ...prev, [name]: true }));

  return (
    <div data-component="liveFeeds">
      {/* Channel selector strip */}
      <div className="flex items-center border-b border-border/50">
        {CHANNELS.map((ch, i) => (
          <button
            key={ch.name}
            onClick={() => setActiveChannel(i)}
            className={`flex-1 px-2 py-2 text-[0.611rem] font-semibold uppercase tracking-wide transition-all ${
              i === activeChannel
                ? `${ch.textColor} border-b-2 ${ch.textColor.replace("text-", "border-")}`
                : "text-zinc-600 hover:text-zinc-400"
            }`}
          >
            {ch.shortName}
          </button>
        ))}
      </div>

      {/* Player area — keyed by channel name so switching fully tears down */}
      <div className="relative">
        {streamFailed[channel.name] ? (
          <ChannelFallback channel={channel} />
        ) : channel.kind === "youtube" ? (
          <YouTubeEmbed key={channel.name} channel={channel} />
        ) : channel.kind === "radio" ? (
          <RadioPlayer key={channel.name} channel={channel} onFatalError={markFailed(channel.name)} />
        ) : (
          <VideoPlayer
            key={channel.name}
            src={channel.streamUrl!}
            kind="tv"
            title={channel.name}
            onFatalError={markFailed(channel.name)}
          />
        )}
      </div>

      {/* Status bar */}
      <div className="px-3 py-1.5 flex items-center justify-between border-t border-border/50">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[0.556rem] text-red-400 font-semibold">LIVE</span>
        </div>
        <a
          href={channel.directUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[0.556rem] text-zinc-600 hover:text-emerald-400 flex items-center gap-1 transition-colors"
        >
          Open in new tab <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </div>
  );
}
