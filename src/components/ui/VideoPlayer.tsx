"use client";

import { useEffect, useRef, useState } from "react";
import videojs from "video.js";
import "video.js/dist/video-js.css";
import { Volume2 } from "lucide-react";

type Player = ReturnType<typeof videojs>;

interface VideoPlayerProps {
  /** HLS manifest URL. */
  src: string;
  /** tv = 16:9 video; radio = compact audio-only layout. */
  kind: "tv" | "radio";
  title?: string;
  /** Fired on unrecoverable player error (bad stream, CORS, geo-block). */
  onFatalError?: () => void;
}

/**
 * Site video player, built on video.js (VHS handles HLS in MSE browsers,
 * native HLS on Safari). Starts automatically, muted, per browser autoplay
 * policy — a large centre overlay button unmutes. Skin overrides live in
 * globals.css under `.video-js`.
 */
export default function VideoPlayer({ src, kind, title, onFatalError }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const onFatalErrorRef = useRef(onFatalError);
  onFatalErrorRef.current = onFatalError;
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // video.js replaces the element it mounts on, so create a fresh one per
    // src — React never reconciles it.
    const videoEl = document.createElement("video-js");
    videoEl.classList.add("vjs-gg-skin");
    container.appendChild(videoEl);

    const player = videojs(videoEl, {
      autoplay: "muted",
      muted: true,
      controls: true,
      liveui: true,
      fluid: true,
      aspectRatio: kind === "tv" ? "16:9" : "16:2",
      preload: "auto",
      sources: [{ src, type: "application/x-mpegURL" }],
    });
    playerRef.current = player;

    player.on("volumechange", () => setMuted(player.muted() ?? false));
    player.on("error", () => onFatalErrorRef.current?.());
    // Belt-and-braces autoplay: some ABR streams reject the initial
    // autoplay attempt before the manifest is parsed — retry when playable.
    player.on("canplay", () => {
      if (player.paused()) player.play()?.catch(() => {});
    });

    return () => {
      playerRef.current = null;
      player.dispose();
    };
  }, [src, kind]);

  function unmute() {
    const player = playerRef.current;
    if (!player) return;
    player.muted(false);
    player.play()?.catch(() => {});
  }

  return (
    <div data-component="videoPlayer" data-kind={kind} className="relative bg-black group/player">
      {kind === "radio" ? (
        <div className="flex items-center gap-2 px-3 pt-3 pb-1">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-[0.611rem] uppercase tracking-wider text-zinc-400">
            {title ?? "Live radio"}
          </span>
        </div>
      ) : null}

      <div ref={containerRef} />

      {/* Centre unmute overlay — appears on hover (or keyboard focus) while
          muted; only the button captures clicks so controls stay usable */}
      {muted ? (
        <div
          data-component="unmuteOverlay"
          className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none opacity-0 group-hover/player:opacity-100 focus-within:opacity-100 transition-opacity duration-200"
        >
          <button
            onClick={unmute}
            aria-label={`Unmute ${title ?? "stream"}`}
            className="pointer-events-auto flex items-center gap-2 px-5 py-3 bg-emerald-500/90 text-black text-xs font-bold uppercase tracking-wider hover:bg-emerald-400 transition-colors shadow-lg"
          >
            <Volume2 className="h-4 w-4" />
            Tap to unmute
          </button>
        </div>
      ) : null}
    </div>
  );
}
