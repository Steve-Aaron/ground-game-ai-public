"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type HlsType from "hls.js";
import { ExternalLink, Play, Radio, Tv } from "lucide-react";

type ChannelKind = "tv" | "radio";

interface Channel {
  name: string;
  shortName: string;
  kind: ChannelKind;
  /** HLS (.m3u8) manifest — the IPTV stream. */
  streamUrl: string;
  /** Official page, used as fallback when the stream fails. */
  directUrl: string;
  color: string;
  textColor: string;
  description: string;
}

// IPTV streams (HLS manifests) sourced from
// https://github.com/Free-TV/IPTV/blob/master/lists/uk.md
// BBC and Sky streams are geo-fenced to the UK at the CDN. If a stream dies,
// the player falls back to a card linking to the channel's official page.
const CHANNELS: Channel[] = [
  {
    name: "Sky News",
    shortName: "SKY",
    kind: "tv",
    streamUrl:
      "https://linear021-gb-hls1-prd-ak.cdn.skycdp.com/Content/HLS_001_hd/Live/channel(skynews)/index_mob.m3u8",
    directUrl: "https://news.sky.com/watch-live",
    color: "bg-sky-600/20",
    textColor: "text-sky-400",
    description: "Live IPTV stream (UK)",
  },
  {
    name: "GB News",
    shortName: "GB",
    kind: "tv",
    streamUrl:
      "https://live-gbnews.simplestreamcdn.com/live5/gbnews/bitrate1.isml/manifest.m3u8",
    directUrl: "https://www.gbnews.com/watch/live",
    color: "bg-red-600/20",
    textColor: "text-red-400",
    description: "Live IPTV stream",
  },
  {
    name: "BBC News",
    shortName: "BBC",
    kind: "tv",
    streamUrl:
      "https://vs-hls-pushb-uk-live.akamaized.net/x=4/i=urn:bbc:pips:service:bbc_news_channel_hd/iptv_hd_abr_v1.m3u8",
    directUrl: "https://www.bbc.co.uk/iplayer/live/bbcnews",
    color: "bg-red-700/20",
    textColor: "text-red-300",
    description: "Live IPTV stream (UK only)",
  },
  {
    name: "BBC Parliament",
    shortName: "PARL",
    kind: "tv",
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
    streamUrl:
      "https://as-hls-ww-live.akamaized.net/pool_904/live/ww/bbc_radio_five_live/bbc_radio_five_live.isml/bbc_radio_five_live-audio%3d96000.norewind.m3u8",
    directUrl: "https://www.bbc.co.uk/sounds/play/live:bbc_radio_five_live",
    color: "bg-yellow-600/20",
    textColor: "text-yellow-400",
    description: "Live IPTV audio stream",
  },
];

// Fatal-error recovery attempts before giving up and showing the fallback.
const MAX_RECOVERY_ATTEMPTS = 2;

/**
 * HLS player. Plays the stream automatically, muted (browser autoplay policy
 * requires mute; the user can unmute via the native controls). Safari plays
 * HLS natively; other browsers get hls.js (loaded on demand to keep it out
 * of the main bundle).
 */
function HlsPlayer({
  channel,
  onFatalError,
}: {
  channel: Channel;
  onFatalError: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: HlsType | null = null;
    let cancelled = false;
    let recoveryAttempts = 0;

    const autoplay = () => {
      video.muted = true; // set before play() so autoplay policy allows it
      video.play().catch(() => {
        /* Autoplay rejected — the user can press play via controls. */
      });
    };

    async function setup() {
      if (!video) return;
      // Native HLS (Safari, iOS).
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = channel.streamUrl;
        autoplay();
        return;
      }

      const { default: Hls } = await import("hls.js");
      if (cancelled || !video) return;
      if (!Hls.isSupported()) {
        onFatalError();
        return;
      }

      hls = new Hls({ enableWorker: true });
      hls.loadSource(channel.streamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, autoplay);
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal || !hls) return;
        recoveryAttempts += 1;
        if (recoveryAttempts > MAX_RECOVERY_ATTEMPTS) {
          hls.destroy();
          onFatalError();
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          hls.destroy();
          onFatalError();
        }
      });
    }

    setup();

    return () => {
      cancelled = true;
      hls?.destroy();
      video.removeAttribute("src");
      video.load();
    };
  }, [channel, onFatalError]);

  if (channel.kind === "radio") {
    return (
      <div data-component="radioPlayer" className="relative w-full bg-black">
        <div className="flex flex-col items-center justify-center py-8">
          <div className={`p-3 rounded-full ${channel.color} mb-2`}>
            <Radio className={`h-6 w-6 ${channel.textColor}`} />
          </div>
          <p className="text-xs text-zinc-300 font-medium">{channel.name}</p>
          <p className="text-[0.556rem] text-zinc-600 uppercase tracking-wider mt-1">
            Muted — unmute below to listen
          </p>
        </div>
        <video ref={videoRef} muted autoPlay playsInline controls className="w-full h-10" />
      </div>
    );
  }

  return (
    <div data-component="tvPlayer" className="relative w-full" style={{ paddingBottom: "56.25%" }}>
      <video
        ref={videoRef}
        muted
        autoPlay
        playsInline
        controls
        className="absolute inset-0 w-full h-full bg-black"
        title={`${channel.name} live stream`}
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
  const [streamFailed, setStreamFailed] = useState<Record<number, boolean>>({});
  const channel = CHANNELS[activeChannel];

  const handleFatalError = useCallback(() => {
    setStreamFailed((prev) => ({ ...prev, [activeChannel]: true }));
  }, [activeChannel]);

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

      {/* Player area — keyed by channel so switching fully tears down the stream */}
      <div className="relative">
        {streamFailed[activeChannel] ? (
          <ChannelFallback channel={channel} />
        ) : (
          <HlsPlayer key={channel.name} channel={channel} onFatalError={handleFatalError} />
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
