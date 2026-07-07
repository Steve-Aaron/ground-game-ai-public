"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CONSTITUENCIES } from "@/data/constituencies";
import UsersTable from "./UsersTable";
import UserEditDrawer from "./UserEditDrawer";
import InviteUserForm from "./InviteUserForm";
import type { UserRecord } from "@/lib/auth";

interface Props {
  currentUid: string;
}

// Precompute once so all child components reference the same list.
const ALL_CONSTITUENCIES = CONSTITUENCIES.map((c) => ({
  slug: c.slug,
  name: c.name,
}));

export default function AdminPanel({ currentUid }: Props) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<UserRecord | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <div data-component="AdminPanel" className="min-h-screen bg-[#0a0a0a] text-zinc-200">
      <header className="bg-[#141414] border-b border-[#2a2a2a] sticky top-0 z-40">
        <div className="flex items-center justify-between px-[1.333rem] py-[0.889rem]">
          <div className="flex items-center gap-[1.333rem]">
            <Link
              href="/"
              className="text-zinc-500 hover:text-zinc-200 flex items-center gap-[0.333rem] text-[0.778rem] uppercase tracking-wider"
            >
              <ArrowLeft className="h-[0.889rem] w-[0.889rem]" />
              Dashboard
            </Link>
            <div className="h-[1rem] w-px bg-[#2a2a2a]" />
            <div className="flex items-center gap-[0.444rem]">
              <div className="h-[0.444rem] w-[0.444rem] rounded-full bg-emerald-500" />
              <span className="text-[1rem] font-bold text-zinc-100 tracking-tight uppercase">
                Admin <span className="text-emerald-500">Panel</span>
              </span>
            </div>
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="bg-emerald-500 hover:bg-emerald-400 text-black text-[0.833rem] font-medium uppercase tracking-wider px-[1.111rem] py-[0.556rem] transition-colors"
          >
            Invite user
          </button>
        </div>
      </header>

      <main className="px-[1.333rem] py-[1.778rem] max-w-[80rem] mx-auto">
        <div className="mb-[1.111rem] flex items-center justify-between">
          <h2 className="text-[0.833rem] uppercase tracking-wider text-zinc-500">
            Users ({users.length})
          </h2>
          <button
            onClick={refresh}
            className="text-[0.722rem] uppercase tracking-wider text-zinc-500 hover:text-zinc-200"
          >
            Refresh
          </button>
        </div>

        {error ? (
          <div className="border border-red-500/30 bg-red-500/10 text-red-300 text-[0.833rem] p-[0.889rem] mb-[1.111rem]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="text-zinc-600 text-[0.833rem]">Loading users…</div>
        ) : (
          <UsersTable
            users={users}
            currentUid={currentUid}
            onEdit={(u) => setEditing(u)}
          />
        )}
      </main>

      {editing ? (
        <UserEditDrawer
          user={editing}
          currentUid={currentUid}
          allConstituencies={ALL_CONSTITUENCIES}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
          onDeleted={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      ) : null}

      {showInvite ? (
        <InviteUserForm
          allConstituencies={ALL_CONSTITUENCIES}
          onClose={() => setShowInvite(false)}
          onInvited={async () => {
            setShowInvite(false);
            await refresh();
          }}
        />
      ) : null}
    </div>
  );
}
