"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { UserRecord, UserRole } from "@/lib/auth";
import ConstituencyMultiSelect from "./ConstituencyMultiSelect";

interface Props {
  user: UserRecord;
  currentUid: string;
  allConstituencies: { slug: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

export default function UserEditDrawer({
  user,
  currentUid,
  allConstituencies,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const [role, setRole] = useState<UserRole>(user.role);
  const [allowed, setAllowed] = useState<string[]>(user.allowedConstituencies);
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isSelf = user.uid === currentUid;

  async function onSave() {
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          allowedConstituencies: allowed,
          displayName,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Save failed (${res.status})`);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Delete ${user.email}? This revokes all access.`)) return;
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.uid}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Delete failed (${res.status})`);
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60 z-[60]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        data-component="UserEditDrawer"
        className="fixed inset-y-0 right-0 w-full sm:w-[32rem] bg-[#141414] border-l border-[#2a2a2a] z-[70] flex flex-col"
      >
        <div className="flex items-center justify-between px-[1.333rem] py-[0.889rem] border-b border-[#2a2a2a]">
          <div>
            <p className="text-[0.722rem] uppercase tracking-wider text-zinc-500">Editing</p>
            <p className="text-[0.944rem] text-zinc-200 truncate">{user.email}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-zinc-400 hover:text-white">
            <X className="h-[1rem] w-[1rem]" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-[1.333rem] space-y-[1.444rem]">
          <div>
            <label className="block text-[0.722rem] text-zinc-500 uppercase tracking-widest mb-[0.556rem]">
              Display name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-emerald-500 outline-none px-[0.833rem] py-[0.611rem] text-[0.833rem] text-zinc-100"
            />
          </div>

          <div>
            <label className="block text-[0.722rem] text-zinc-500 uppercase tracking-widest mb-[0.556rem]">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              disabled={isSelf}
              className="w-full bg-[#0a0a0a] border border-[#2a2a2a] focus:border-emerald-500 outline-none px-[0.833rem] py-[0.611rem] text-[0.833rem] text-zinc-100 disabled:opacity-50"
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            {isSelf ? (
              <p className="mt-[0.333rem] text-[0.667rem] text-zinc-600">
                You can&apos;t change your own role.
              </p>
            ) : null}
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
        </div>

        <div className="border-t border-[#2a2a2a] p-[1.111rem] flex items-center justify-between gap-[0.556rem]">
          <button
            onClick={onDelete}
            disabled={saving || isSelf}
            className="text-[0.833rem] text-red-400 hover:text-red-300 uppercase tracking-wider disabled:opacity-30"
          >
            Delete user
          </button>
          <div className="flex gap-[0.556rem]">
            <button
              onClick={onClose}
              className="border border-[#2a2a2a] text-zinc-300 hover:border-zinc-500 text-[0.833rem] uppercase tracking-wider px-[1.111rem] py-[0.611rem]"
            >
              Cancel
            </button>
            <button
              onClick={onSave}
              disabled={saving}
              className="bg-emerald-500 hover:bg-emerald-400 text-black text-[0.833rem] font-medium uppercase tracking-wider px-[1.111rem] py-[0.611rem] disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
