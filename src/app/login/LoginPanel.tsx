"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Loader2, Mail, Wand2 } from "lucide-react";
import {
  getAuth,
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
import { GoogleIcon } from "./BrandIcons";
import ThemeToggle from "@/components/ThemeToggle";

const EMAIL_FOR_SIGNIN_KEY = "ggi.emailForSignIn";

type Mode =
  | "idle"
  | "sending-link"
  | "link-sent"
  | "completing-link"
  | "google-loading"
  | "password-loading"
  | "sending-reset"
  | "reset-sent"
  | "exchanging-cookie"
  | "success";

// Magic link is the default single-field flow; password is the fallback.
type EmailMethod = "link" | "password";

const FIELD_CLASS =
  "w-full rounded-full bg-transparent border border-border focus:border-emerald-500 outline-none pl-10 pr-4 py-2.5 text-sm text-foreground placeholder:text-zinc-500 transition-colors";

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
    } catch (err) {
      setMode("idle");
      setError(humaniseFirebaseError(err));
    }
  }

  async function onPasswordSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email || !password) return;
    setMode("password-loading");
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await exchangeCookie(cred.user, router, nextPath, setError, setMode);
    } catch (err) {
      setMode("idle");
      setError(humaniseFirebaseError(err));
    }
  }

  async function onForgotPassword() {
    setError(null);
    if (!email) {
      setError("Enter your email first, then tap 'Forgot password?'.");
      return;
    }
    setMode("sending-reset");
    try {
      await sendPasswordResetEmail(auth, email);
      setResetEmailFor(email);
      setMode("reset-sent");
    } catch (err) {
      setMode("idle");
      setError(humaniseFirebaseError(err));
    }
  }

  const busy =
    mode === "google-loading" ||
    mode === "password-loading" ||
    mode === "sending-link" ||
    mode === "sending-reset" ||
    mode === "completing-link" ||
    mode === "exchanging-cookie" ||
    mode === "success";

  return (
    <div data-component="loginPortal" className="min-h-screen grid grid-cols-12 bg-background">
      {/* ── Brand panel: repeating black texture + centred election artwork ── */}
      <div
        data-component="loginBrandPanel"
        className="hidden lg:flex col-span-7 flex-col items-center justify-center relative"
        style={{ backgroundColor: "#0a0a0a", backgroundImage: "url(/login-texture.svg)" }}
      >
        <div className="text-center mb-10 login-fade login-fade-1">
          <p className="text-2xl font-bold text-white tracking-tight">Welcome to</p>
          <p className="text-sm uppercase tracking-[0.3em] text-emerald-400 mt-1">
            Ground Game <span className="text-white">Intel</span>
          </p>
        </div>
        <div
          data-component="loginArtwork"
          className="h-[22rem] w-[22rem] rounded-full bg-emerald-500 flex items-center justify-center shadow-[0_0_120px_rgba(16,185,129,0.25)] login-fade login-fade-2"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/election.svg" alt="" className="h-[11rem] w-[11rem]" />
        </div>
        <p className="mt-10 text-[0.611rem] uppercase tracking-widest text-zinc-600 login-fade login-fade-3">
          Constituency Intelligence Platform
        </p>
      </div>

      {/* ── Form panel ── */}
      <div
        data-component="loginFormPanel"
        className="col-span-12 lg:col-span-5 relative flex items-center justify-center px-6 py-12"
      >
        <div className="absolute top-4 right-4 login-fade login-fade-1">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">
          <div className="login-fade login-fade-2">
            <h1 className="text-2xl font-bold text-foreground text-center tracking-tight">
              Log in to your account
            </h1>
            <p className="text-xs text-zinc-500 text-center mt-1.5 mb-8">
              Please enter your details
            </p>
          </div>

          {mode === "link-sent" ? (
            <div data-component="magicLinkSent" className="text-center space-y-3">
              <div className="mx-auto h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <Mail className="h-5 w-5 text-emerald-400" />
              </div>
              <p className="text-sm text-foreground">Check your inbox</p>
              <p className="text-xs text-zinc-500">
                We sent a magic sign-in link to <span className="text-foreground">{email}</span>.
                Open it on this device to log in.
              </p>
              <button
                onClick={() => setMode("idle")}
                className="text-xs text-emerald-400 hover:text-emerald-300"
              >
                Use a different method
              </button>
            </div>
          ) : (
            <>
              {/* Google */}
              <button
                data-component="googleSignIn"
                onClick={onGoogle}
                disabled={busy}
                className="w-full rounded-full bg-white text-zinc-900 border border-zinc-300 dark:border-transparent text-sm font-semibold py-2.5 flex items-center justify-center gap-2 hover:bg-zinc-200 transition-colors disabled:opacity-50 login-fade login-fade-3"
              >
                {mode === "google-loading" || (mode === "exchanging-cookie" && !email) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <GoogleIcon className="h-4 w-4" />
                )}
                Continue with Google
              </button>

              <div className="flex items-center gap-3 my-6 login-fade login-fade-4">
                <span className="flex-1 h-px bg-border" />
                <span className="text-[0.611rem] uppercase tracking-wider text-zinc-600">or</span>
                <span className="flex-1 h-px bg-border" />
              </div>

              {/* Email — magic link (default) or password */}
              <form
                data-component="emailSignInForm"
                onSubmit={emailMethod === "link" ? onSendMagicLink : onPasswordSignIn}
                className="space-y-3 login-fade login-fade-5"
              >
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    autoComplete="email"
                    className={FIELD_CLASS}
                  />
                </div>

                {emailMethod === "password" ? (
                  <div className="relative">
                    <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      autoComplete="current-password"
                      className={FIELD_CLASS}
                    />
                  </div>
                ) : null}

                {emailMethod === "password" ? (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={onForgotPassword}
                      className="text-[0.667rem] text-zinc-500 hover:text-emerald-400"
                    >
                      Forgot password?
                    </button>
                  </div>
                ) : null}

                <button
                  data-component="emailSignInSubmit"
                  type="submit"
                  disabled={busy || !email || (emailMethod === "password" && !password)}
                  className="w-full rounded-full bg-emerald-500 text-black text-sm font-bold py-2.5 flex items-center justify-center gap-2 hover:bg-emerald-400 transition-colors disabled:opacity-50"
                >
                  {busy && mode !== "google-loading" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : emailMethod === "link" ? (
                    <Wand2 className="h-4 w-4" />
                  ) : null}
                  {emailMethod === "link" ? "Email me a magic link" : "Log in"}
                </button>
              </form>

              <p className="text-center text-xs text-zinc-500 mt-6">
                {emailMethod === "link" ? (
                  <>
                    Have a password?{" "}
                    <button
                      onClick={() => setEmailMethod("password")}
                      className="text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      Log in with password
                    </button>
                  </>
                ) : (
                  <>
                    Prefer no password?{" "}
                    <button
                      onClick={() => setEmailMethod("link")}
                      className="text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      Use a magic link
                    </button>
                  </>
                )}
              </p>

              {mode === "reset-sent" ? (
                <p className="text-center text-xs text-emerald-400 mt-3">
                  Password reset email sent to {resetEmailFor}.
                </p>
              ) : null}
            </>
          )}

          {error ? (
            <p data-component="loginError" className="text-center text-xs text-red-400 mt-4">
              {error}
            </p>
          ) : null}

          <p className="text-center text-[0.611rem] text-zinc-600 mt-8">
            Access is invite-only. Contact your administrator if you need an account.
          </p>
        </div>
      </div>
    </div>
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
    setMode("success");
    setTimeout(() => {
      router.replace(nextPath);
    }, 300);
  } catch (e) {
    setMode("idle");
    setError(humaniseFirebaseError(e));
  }
}

function humaniseFirebaseError(e: unknown): string {
  const msg = (e as { message?: string })?.message || "Sign-in failed.";
  return (
    msg
      .replace(/^Firebase:\s*/, "")
      .replace(/\s*\([^)]+\)\.?$/, "")
      .trim() || "Sign-in failed."
  );
}
