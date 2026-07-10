"use client";

import { useState } from "react";
import { X, Copy, Check } from "lucide-react";
import type { UserRole } from "@/lib/auth";
import ConstituencyMultiSelect from "./ConstituencyMultiSelect";

interface Props {
  allConstituencies: { slug: string; name: string }[];
  onClose: () => void;
  onInvited: () => void;
}

export default function InviteUserForm({ allConstituencies, onClose, onInvited }: Props) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<UserRole>("user");
  // Default new invitees to Braintree; admin can add more before submitting.
  const [allowed, setAllowed] = useState<string[]>(["braintree"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName, role, allowedConstituencies: allowed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Invite failed (${res.status})`);
      setInviteLink(body.inviteLink || null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function copyLink() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[60]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        data-component="InviteUserForm"
        className="fixed inset-y-0 right-0 w-full sm:w-[32rem] bg-card border-l border-border z-[70] flex flex-col"
      >
        <div className="flex items-center justify-between px-[1.333rem] py-[0.889rem] border-b border-border">
          <div>
            <p className="text-[0.722rem] uppercase tracking-wider text-zinc-500">Invite</p>
            <p className="text-[0.944rem] text-foreground">New user</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-white">
            <X className="h-[1rem] w-[1rem]" />
          </button>
        </div>

        {inviteLink ? (
          <div data-component="InviteSuccess" className="flex-1 overflow-y-auto p-[1.333rem]">
            <div className="border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-[0.833rem] p-[0.889rem] mb-[1.111rem]">
              User created. Send them this sign-in link:
            </div>
            <div className="bg-background border border-border p-[0.889rem] text-[0.722rem] text-zinc-400 break-all mb-[0.889rem] font-mono">
              {inviteLink}
            </div>
            <button
              onClick={copyLink}
              className="w-full border border-border hover:border-emerald-500 text-foreground text-[0.833rem] uppercase tracking-wider py-[0.611rem] flex items-center justify-center gap-[0.556rem]"
            >
              {copied ? (
                <>
                  <Check className="h-[1rem] w-[1rem] text-emerald-400" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-[1rem] w-[1rem]" /> Copy link
                </>
              )}
            </button>
            <p className="mt-[1.111rem] text-[0.667rem] text-zinc-600 leading-relaxed">
              The link expires per Firebase&apos;s default policy. The user can also sign in with
              Google using the same email; either method completes the invite.
            </p>
            <div className="mt-[1.778rem] flex justify-end">
              <button
                onClick={onInvited}
                className="bg-emerald-500 hover:bg-emerald-400 text-black text-[0.833rem] font-medium uppercase tracking-wider px-[1.111rem] py-[0.611rem]"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-[1.333rem] space-y-[1.444rem]">
            <div>
              <label className="block text-[0.722rem] text-zinc-500 uppercase tracking-widest mb-[0.556rem]">
                Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full bg-background border border-border focus:border-emerald-500 outline-none px-[0.833rem] py-[0.611rem] text-[0.833rem] text-foreground"
              />
            </div>

            <div>
              <label className="block text-[0.722rem] text-zinc-500 uppercase tracking-widest mb-[0.556rem]">
                Display name (optional)
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-background border border-border focus:border-emerald-500 outline-none px-[0.833rem] py-[0.611rem] text-[0.833rem] text-foreground"
              />
            </div>

            <div>
              <label className="block text-[0.722rem] text-zinc-500 uppercase tracking-widest mb-[0.556rem]">
                Role
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full bg-background border border-border focus:border-emerald-500 outline-none px-[0.833rem] py-[0.611rem] text-[0.833rem] text-foreground"
              >
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <ConstituencyMultiSelect
              options={allConstituencies}
              selected={allowed}
              onChange={setAllowed}
            />

            {error ? (
              <div className="border border-red-500/30 bg-red-500/10 text-red-300 text-[0.833rem] p-[0.889rem]">
                {error}
              </div>
            ) : null}

            <div className="pt-[0.556rem] flex justify-end gap-[0.556rem]">
              <button
                type="button"
                onClick={onClose}
                className="border border-border text-zinc-300 hover:border-zinc-500 text-[0.833rem] uppercase tracking-wider px-[1.111rem] py-[0.611rem]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !email}
                className="bg-emerald-500 hover:bg-emerald-400 text-black text-[0.833rem] font-medium uppercase tracking-wider px-[1.111rem] py-[0.611rem] disabled:opacity-50"
              >
                {submitting ? "Inviting…" : "Send invite"}
              </button>
            </div>
          </form>
        )}
      </aside>
    </>
  );
}
