"use client";

import { Suspense } from "react";
import LoginPanel from "./LoginPanel";

// Skeleton mirroring LoginPanel's centred card so there's no layout jump.
function LoginSkeleton() {
  return (
    <div
      data-component="loginSkeleton"
      className="min-h-screen bg-background flex items-center justify-center px-4"
    >
      <div className="w-full max-w-sm border border-border bg-card p-8 space-y-4">
        <div className="h-4 w-40 bg-muted rounded animate-pulse" />
        <div className="h-9 w-full bg-muted/50 rounded animate-pulse" />
        <div className="h-9 w-full bg-muted/50 rounded animate-pulse" />
        <div className="h-9 w-full bg-muted/70 rounded animate-pulse" />
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
