// /admin — user management.
// Server component guard: redirect non-admins. The actual interactivity lives
// in AdminPanel (client component) below.

import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import AdminPanel from "./AdminPanel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await verifySession();
  if (!session) redirect("/login?next=/admin");
  if (session.role !== "admin") redirect("/");
  return <AdminPanel currentUid={session.uid} />;
}
