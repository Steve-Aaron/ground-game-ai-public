"use client";

import { Suspense } from "react";
import LoginPanel from "./LoginPanel";

// Skeleton mirroring LoginPanel's centred card so there's no layout jump.
function LoginSkeleton() {
  return (
    <div
      data-component="loginSkeleton"
      className="min-h-screen grid grid-cols-12 bg-background"
    >
      <div className="hidden lg:block col-span-7 bg-[#0a0a0a]" />
      <div className="col-span-12 lg:col-span-5 flex items-center justify-center px-6">
        <div className="w-full max-w-xs space-y-3">
          <div className="h-5 w-44 bg-muted rounded animate-pulse" />
          <div className="h-8 w-full bg-muted/60 animate-pulse" />
          <div className="h-8 w-full bg-muted/40 animate-pulse" />
          <div className="h-8 w-full bg-muted/60 animate-pulse" />
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
