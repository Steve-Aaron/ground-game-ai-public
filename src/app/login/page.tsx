"use client";

import { Suspense } from "react";
import LoginPanel from "./LoginPanel";

// Skeleton mirroring LoginPanel's centred card so there's no layout jump.
function LoginSkeleton() {
  return (
    <div
      data-component="loginSkeleton"
      className="min-h-screen grid grid-cols-12 bg-[#111318]"
    >
      <div className="hidden lg:block col-span-7 bg-[#0a0a0a]" />
      <div className="col-span-12 lg:col-span-5 flex items-center justify-center px-6">
        <div className="w-full max-w-sm space-y-4">
          <div className="h-6 w-52 mx-auto bg-zinc-800 rounded animate-pulse" />
          <div className="h-10 w-full bg-zinc-800/60 rounded-full animate-pulse" />
          <div className="h-10 w-full bg-zinc-800/40 rounded-full animate-pulse" />
          <div className="h-10 w-full bg-zinc-800/60 rounded-full animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// useSearchParams needs Suspense in the App Router.
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginPanel />
    </Suspense>
  );
}
