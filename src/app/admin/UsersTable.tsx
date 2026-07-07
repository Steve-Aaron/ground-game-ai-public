"use client";

import { Edit2 } from "lucide-react";
import type { UserRecord } from "@/lib/auth";

interface Props {
  users: UserRecord[];
  currentUid: string;
  onEdit: (u: UserRecord) => void;
}

export default function UsersTable({ users, currentUid, onEdit }: Props) {
  if (users.length === 0) {
    return (
      <div className="border border-[#2a2a2a] bg-[#141414] p-[1.333rem] text-center text-[0.833rem] text-zinc-600">
        No users yet. Invite the first one to get started.
      </div>
    );
  }

  return (
    <div data-component="UsersTable" className="border border-[#2a2a2a] bg-[#141414] overflow-x-auto">
      <table className="w-full text-[0.889rem]">
        <thead>
          <tr className="text-left text-[0.722rem] uppercase tracking-widest text-zinc-500 border-b border-[#2a2a2a]">
            <th className="px-[1.111rem] py-[0.889rem] font-medium">Email</th>
            <th className="px-[1.111rem] py-[0.889rem] font-medium">Role</th>
            <th className="px-[1.111rem] py-[0.889rem] font-medium">Constituencies</th>
            <th className="px-[1.111rem] py-[0.889rem] font-medium w-[3rem]"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.uid} className="border-b border-[#1f1f1f] last:border-0 hover:bg-[#1a1a1a]">
              <td className="px-[1.111rem] py-[0.889rem] text-zinc-200">
                {u.email}
                {u.uid === currentUid ? (
                  <span className="ml-[0.556rem] text-[0.611rem] uppercase tracking-widest text-emerald-500">
                    you
                  </span>
                ) : null}
              </td>
              <td className="px-[1.111rem] py-[0.889rem]">
                <span
                  className={`px-[0.556rem] py-[0.111rem] text-[0.722rem] uppercase tracking-wider border ${
                    u.role === "admin"
                      ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10"
                      : "border-zinc-700 text-zinc-400"
                  }`}
                >
                  {u.role}
                </span>
              </td>
              <td className="px-[1.111rem] py-[0.889rem] text-zinc-400">
                {u.allowedConstituencies.length === 0 ? (
                  <span className="text-zinc-600 italic">none</span>
                ) : (
                  <span>
                    {u.allowedConstituencies.length} seat
                    {u.allowedConstituencies.length === 1 ? "" : "s"}
                  </span>
                )}
              </td>
              <td className="px-[1.111rem] py-[0.889rem] text-right">
                <button
                  onClick={() => onEdit(u)}
                  aria-label={`Edit ${u.email}`}
                  className="text-zinc-500 hover:text-emerald-400"
                >
                  <Edit2 className="h-[1rem] w-[1rem]" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
