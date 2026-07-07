"use client";

// Inline padlock SVG used as the visual anchor on the login screen.
//
// Anatomy:
//   .padlock-shackle  — the U-shape on top, rotates open on success
//   .padlock-body     — rounded rectangle below, pulses while loading
//   children          — overlaid HTML content positioned over the body
//
// The SVG defines a viewBox so the lock scales fluidly. Content is
// positioned with percentages so it tracks the SVG as it scales.

import type { CSSProperties } from "react";

interface PadlockGraphicProps {
  state: "locked" | "loading" | "unlocking";
  children?: React.ReactNode;
  className?: string;
  style?: CSSProperties;
}

export default function PadlockGraphic({
  state,
  children,
  className,
  style,
}: PadlockGraphicProps) {
  return (
    <div
      data-component="PadlockGraphic"
      data-state={state}
      className={`relative w-full ${className ?? ""}`}
      style={style}
    >
      <svg
        viewBox="0 0 600 720"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-auto"
        aria-hidden="true"
      >
        <defs>
          {/* Transparency-grid (checker) texture — matches the reference
              image's 'cut-out' look. Two stacked rects per tile give the
              alternating light/dark squares. */}
          <pattern
            id="padlock-checker"
            x="0"
            y="0"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <rect width="10" height="10" fill="#e4e4e7" />
            <rect x="0" y="0" width="1.5" height="1.5" fill="#c4c4c8" />
            <rect x="1.5" y="1.5" width="1.5" height="1.5" fill="#c4c4c8" />
          </pattern>

          {/* Shape masks so the checker pattern is clipped exactly to the
              shackle and body silhouettes. */}
          <mask id="padlock-shackle-mask" maskUnits="userSpaceOnUse">
            <path
              d="M 160 360
                 L 160 220
                 A 140 140 0 0 1 440 220
                 L 440 360"
              fill="none"
              stroke="white"
              strokeWidth="52"
              strokeLinecap="round"
            />
          </mask>
          <mask id="padlock-body-mask" maskUnits="userSpaceOnUse">
            <rect
              x="60"
              y="340"
              width="480"
              height="360"
              rx="28"
              ry="28"
              fill="white"
            />
          </mask>
        </defs>

        {/* Shackle (U-shape). Pivot is the right-hand foot so it rotates
            open like a real padlock. The visible look is the checker
            pattern clipped through the shackle mask. */}
        <g
          className={`padlock-shackle ${
            state === "unlocking" ? "padlock-shackle-unlocking" : ""
          }`}
          style={{ transformOrigin: "440px 320px" }}
        >
          <rect
            x="0"
            y="0"
            width="600"
            height="720"
            fill="url(#padlock-checker)"
            mask="url(#padlock-shackle-mask)"
          />
          {/* Crisp outline so the silhouette reads cleanly against the dark
              page background. */}
          <path
            d="M 160 360
               L 160 220
               A 140 140 0 0 1 440 220
               L 440 360"
            fill="none"
            stroke="#0a0a0a"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>

        {/* Body — rounded rectangle. Pulses gently while loading. */}
        <g
          className={`padlock-body ${
            state === "loading" ? "animate-padlock-pulse" : ""
          }`}
        >
          <rect
            x="0"
            y="0"
            width="600"
            height="720"
            fill="url(#padlock-checker)"
            mask="url(#padlock-body-mask)"
          />
          <rect
            x="60"
            y="340"
            width="480"
            height="360"
            rx="28"
            ry="28"
            fill="none"
            stroke="#0a0a0a"
            strokeWidth="2"
          />
        </g>
      </svg>

      {/* Content overlay — sits inside the lock body. The body occupies the
          bottom half of the viewBox (y 340..700 of 720), so we anchor the
          overlay to that vertical slice via top/bottom percentages. */}
      {children ? (
        <div
          data-component="PadlockContent"
          className="absolute inset-x-[12%] flex flex-col"
          style={{ top: "48%", bottom: "4%" }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
