"use client";

import { Suspense } from "react";
import LoginPanel from "./LoginPanel";

// useSearchParams needs Suspense in the App Router.
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center text-zinc-600 text-xs uppercase tracking-wider">
          Loading…
        </div>
      }
    >
      <LoginPanel />
    </Suspense>
  );
}
