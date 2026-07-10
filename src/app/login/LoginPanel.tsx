"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";
import {
  getAuth,
  GithubAuthProvider,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  type User,
} from "firebase/auth";
import { app } from "@/lib/firebase";
import PadlockGraphic from "./PadlockGraphic";
import { GitHubIcon, GoogleIcon } from "./BrandIcons";

const EMAIL_FOR_SIGNIN_KEY = "ggi.emailForSignIn";

type Mode =
  | "idle"
  | "sending-link"
  | "link-sent"
  | "completing-link"
  | "google-loading"
  | "github-loading"
  | "password-loading"
  | "sending-reset"
  | "reset-sent"
  | "exchanging-cookie"
  | "success";

// Which form sits inside the padlock body. Magic link is the default
// (single field) because it matches the reference image's one-input layout.
type EmailMethod = "link" | "password";

function padlockState(mode: Mode): "locked" | "loading" | "unlocking" {
  if (mode === "success") return "unlocking";
  if (
    mode === "google-loading" ||
    mode === "github-loading" ||
    mode === "password-loading" ||
    mode === "completing-link" ||
    mode === "exchanging-cookie" ||
    mode === "sending-link" ||
    mode === "sending-reset"
  ) {
    return "loading";
  }
  return "locked";
}

export default function LoginPanel() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/";

  const [mode, setMode] = useState<Mode>("idle");
  const [emailMethod, setEmailMethod] = useState<EmailMethod>("link");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resetEmailFor, setResetEmailFor] = useState<string>("");
  const auth = getAuth(app);

  // Magic-link completion handler.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    let stored = window.localStorage.getItem(EMAIL_FOR_SIGNIN_KEY) || "";
    if (!stored) {
      stored = window.prompt("Please confirm your email to complete sign-in:") || "";
    }
    if (!stored) {
      setError("Email required to complete sign-in.");
      return;
    }
    setMode("completing-link");
    signInWithEmailLink(auth, stored, window.location.href)
      .then(async (cred) => {
        window.localStorage.removeItem(EMAIL_FOR_SIGNIN_KEY);
        await exchangeCookie(cred.user, router, nextPath, setError, setMode);
      })
      .catch((e) => {
        setMode("idle");
        setError(humaniseFirebaseError(e));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onPasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) return;
    setMode("password-loading");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await exchangeCookie(cred.user, router, nextPath, setError, setMode);
    } catch (e) {
      setMode("idle");
      setError(humaniseFirebaseError(e));
    }
  }

  async function onSendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email) return;
    setMode("sending-link");
    try {
      await sendSignInLinkToEmail(auth, email, {
        url: `${window.location.origin}/login`,
        handleCodeInApp: true,
      });
      window.localStorage.setItem(EMAIL_FOR_SIGNIN_KEY, email);
      setMode("link-sent");
    } catch (e) {
      setMode("idle");
      setError(humaniseFirebaseError(e));
    }
  }

  async function onForgotPassword() {
    setError(null);
    if (!email) {
      setError("Enter your email above first, then click 'Forgot password?'.");
      return;
    }
    setMode("sending-reset");
    try {
      await sendPasswordResetEmail(auth, email);
      setResetEmailFor(email);
      setMode("reset-sent");
    } catch (e) {
      setMode("idle");
      setError(humaniseFirebaseError(e));
    }
  }

  async function onGoogle() {
    setError(null);
    setMode("google-loading");
    try {
      const cred = await signInWithPopup(auth, new GoogleAuthProvider());
      await exchangeCookie(cred.user, router, nextPath, setError, setMode);
    } catch (e) {
      setMode("idle");
      setError(humaniseFirebaseError(e));
    }
  }

  async function onGitHub() {
    setError(null);
    setMode("github-loading");
    try {
      // Request `user:email` so Firebase receives the user's verified primary
      // email even with GitHub's 'Keep email private' setting enabled.
      const provider = new GithubAuthProvider();
      provider.addScope("user:email");
      const cred = await signInWithPopup(auth, provider);
      await exchangeCookie(cred.user, router, nextPath, setError, setMode);
    } catch (e) {
      setMode("idle");
      setError(humaniseFirebaseError(e));
    }
  }

  const busy =
    mode === "google-loading" ||
    mode === "github-loading" ||
    mode === "password-loading" ||
    mode === "sending-link" ||
    mode === "sending-reset" ||
    mode === "exchanging-cookie" ||
    mode === "completing-link" ||
    mode === "success";

  const lockState = padlockState(mode);
  const inflight =
    mode === "completing-link" || mode === "exchanging-cookie" || mode === "success";

  return (
    <div
      data-component="LoginPanel"
      data-mode={mode}
      className={`min-h-screen bg-background text-foreground flex items-center justify-center px-4 py-10 ${
        mode === "success" ? "animate-login-success-fade" : ""
      }`}
    >
      {/* Subtle background grid */}
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(#e4e4e7 1px, transparent 1px), linear-gradient(90deg, #e4e4e7 1px, transparent 1px)",
          backgroundSize: "2px 2px",
        }}
      />

      <div className="relative z-10 w-full max-w-[26.667rem] flex flex-col items-center">
        {/* Brand chip above the lock */}
        <div
          data-component="LoginBrandChip"
          className="flex items-center gap-2 mb-4"
        >
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <span className="text-sm font-bold text-foreground tracking-tight uppercase">
            Ground Game <span className="text-emerald-500">Intel</span>
          </span>
        </div>

        <PadlockGraphic state={lockState}>
          {inflight ? (
            // ── Loading / success state ────────────────────────────────
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-[0.556rem] uppercase tracking-[0.3em] text-zinc-600 mb-3">
                {mode === "success" ? "Access granted" : "Verifying"}
              </p>
              <p className="text-[2.222rem] leading-tight font-bold uppercase tracking-tight text-[#0a0a0a]">
                {mode === "success" ? "Welcome back" : "Signing you in"}
              </p>
              {mode !== "success" ? (
                <div className="mt-4">
                  <LoadingSpinner size={20} darkOnLight />
                </div>
              ) : null}
            </div>
          ) : mode === "link-sent" ? (
            // ── Magic link sent ────────────────────────────────────────
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-[0.556rem] uppercase tracking-[0.3em] text-zinc-600 mb-3">
                Link sent
              </p>
              <p className="text-[0.778rem] leading-snug text-[#0a0a0a] mb-2">
                Check{" "}
                <span className="font-bold break-all">{email}</span>
              </p>
              <p className="text-[0.611rem] text-zinc-600 mb-4">
                Open the link on this device to finish signing in.
              </p>
              <button
                type="button"
                onClick={() => setMode("idle")}
                className="text-[0.556rem] uppercase tracking-wider text-zinc-700 hover:text-[#0a0a0a]"
              >
                ← Back
              </button>
            </div>
          ) : mode === "reset-sent" ? (
            // ── Password reset sent ────────────────────────────────────
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-[0.556rem] uppercase tracking-[0.3em] text-zinc-600 mb-3">
                Reset link sent
              </p>
              <p className="text-[0.778rem] leading-snug text-[#0a0a0a] mb-2">
                Check{" "}
                <span className="font-bold break-all">{resetEmailFor}</span>
              </p>
              <p className="text-[0.611rem] text-zinc-600 mb-4">
                Set a password, then come back here.
              </p>
              <button
                type="button"
                onClick={() => setMode("idle")}
                className="text-[0.556rem] uppercase tracking-wider text-zinc-700 hover:text-[#0a0a0a]"
              >
                ← Back
              </button>
            </div>
          ) : (
            // ── Default: title block + auth form ───────────────────────
            <div className="flex flex-col h-full">
              {/* Manifesto block — echoes the reference image's text stack */}
              <div className="flex-1 flex flex-col items-center justify-center text-center px-2">
                <p className="text-[0.556rem] uppercase tracking-[0.3em] text-zinc-600 mb-2">
                  Restricted
                </p>
                <div
                  data-component="LockManifesto"
                  className="text-[#0a0a0a] font-bold uppercase tracking-tight leading-[1.05] text-[1.778rem]"
                >
                  <p>Constituency intel</p>
                  <p>Daily briefings</p>
                  <p>Live data feeds</p>
                  <p className="text-emerald-700 mt-1">Invitation only</p>
                </div>
              </div>

              {/* Inline form — single input + circular submit button */}
              {emailMethod === "link" ? (
                <form
                  data-component="MagicLinkForm"
                  onSubmit={onSendMagicLink}
                  className="mt-3"
                >
                  <div className="relative">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email"
                      autoComplete="email"
                      disabled={busy}
                      className="w-full rounded-full bg-white border border-zinc-300 focus:border-emerald-500 outline-none pl-5 pr-12 py-2.5 text-[0.722rem] text-[#0a0a0a] placeholder:text-zinc-400 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={busy || !email}
                      aria-label="Send sign-in link"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      {mode === "sending-link" ? (
                        <LoadingSpinner size={14} dark />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </form>
              ) : (
                <form
                  data-component="PasswordSignInForm"
                  onSubmit={onPasswordSignIn}
                  className="mt-3 space-y-2"
                >
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    autoComplete="email"
                    disabled={busy}
                    className="w-full rounded-full bg-white border border-zinc-300 focus:border-emerald-500 outline-none px-5 py-2.5 text-[0.722rem] text-[#0a0a0a] placeholder:text-zinc-400 disabled:opacity-50"
                  />
                  <div className="relative">
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      autoComplete="current-password"
                      disabled={busy}
                      className="w-full rounded-full bg-white border border-zinc-300 focus:border-emerald-500 outline-none pl-5 pr-12 py-2.5 text-[0.722rem] text-[#0a0a0a] placeholder:text-zinc-400 disabled:opacity-50"
                    />
                    <button
                      type="submit"
                      disabled={busy || !email || !password}
                      aria-label="Sign in"
                      className="absolute right-1 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center transition-colors disabled:opacity-50"
                    >
                      {mode === "password-loading" ? (
                        <LoadingSpinner size={14} dark />
                      ) : (
                        <ArrowRight className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </PadlockGraphic>

        {/* ── Below the lock: provider buttons + method switcher ───────── */}
        {!inflight && mode !== "link-sent" && mode !== "reset-sent" ? (
          <div
            data-component="LoginSecondary"
            className="mt-8 w-full flex flex-col items-center"
          >
            <div className="flex items-center gap-3 mb-4">
              <button
                data-component="GoogleSignInButton"
                type="button"
                onClick={onGoogle}
                disabled={busy}
                aria-label="Continue with Google"
                className="h-11 w-11 border border-border hover:border-zinc-500 bg-card text-foreground flex items-center justify-center transition-colors disabled:opacity-50"
              >
                {mode === "google-loading" ? (
                  <LoadingSpinner size={14} />
                ) : (
                  <GoogleIcon size={16} />
                )}
              </button>
              <button
                data-component="GitHubSignInButton"
                type="button"
                onClick={onGitHub}
                disabled={busy}
                aria-label="Continue with GitHub"
                className="h-11 w-11 border border-border hover:border-zinc-500 bg-card text-foreground flex items-center justify-center transition-colors disabled:opacity-50"
              >
                {mode === "github-loading" ? (
                  <LoadingSpinner size={14} />
                ) : (
                  <GitHubIcon size={16} />
                )}
              </button>
            </div>

            <div className="flex items-center gap-3 text-[0.556rem] uppercase tracking-widest text-zinc-600">
              <button
                type="button"
                onClick={() =>
                  setEmailMethod((m) => (m === "link" ? "password" : "link"))
                }
                className="hover:text-emerald-400"
              >
                {emailMethod === "link"
                  ? "Use password instead"
                  : "Use magic link instead"}
              </button>
              {emailMethod === "password" ? (
                <>
                  <span className="text-zinc-700">·</span>
                  <button
                    type="button"
                    onClick={onForgotPassword}
                    className="hover:text-emerald-400"
                  >
                    {mode === "sending-reset" ? "Sending…" : "Forgot password"}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {error ? (
          <p
            data-component="LoginError"
            className="mt-5 text-[0.611rem] text-red-400 leading-relaxed text-center max-w-xs"
          >
            {error}
          </p>
        ) : null}

        <p className="mt-6 text-[0.556rem] text-zinc-600 leading-relaxed text-center">
          No account? Contact your administrator.
        </p>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

interface LoadingSpinnerProps {
  size?: number;
  dark?: boolean;
  darkOnLight?: boolean;
}
function LoadingSpinner({ size = 14, dark, darkOnLight }: LoadingSpinnerProps) {
  return (
    <span
      data-component="LoadingSpinner"
      className={`inline-block rounded-full border-2 animate-login-spinner ${
        dark
          ? "border-black/30 border-t-black"
          : darkOnLight
          ? "border-zinc-300 border-t-[#0a0a0a]"
          : "border-zinc-600 border-t-zinc-100"
      }`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

async function exchangeCookie(
  user: User,
  router: ReturnType<typeof useRouter>,
  nextPath: string,
  setError: (msg: string | null) => void,
  setMode: (m: Mode) => void
) {
  setMode("exchanging-cookie");
  try {
    const idToken = await user.getIdToken();
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      await getAuth(app).signOut();
      setMode("idle");
      setError(body?.message || body?.error || "Sign-in failed.");
      return;
    }
    // Play unlock animation, then navigate.
    setMode("success");
    setTimeout(() => {
      router.replace(nextPath);
    }, 900);
  } catch (e) {
    setMode("idle");
    setError(humaniseFirebaseError(e));
  }
}

function humaniseFirebaseError(e: unknown): string {
  const msg = (e as { message?: string })?.message || "Sign-in failed.";
  return msg
    .replace(/^Firebase:\s*/, "")
    .replace(/\s*\([^)]+\)\.?$/, "")
    .trim() || "Sign-in failed.";
}
