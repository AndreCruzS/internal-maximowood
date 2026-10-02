import { redirect } from "next/navigation";

// Team logins now live under Profile → Admin; keep old /admin links working.
export default function AdminPage() {
  redirect("/profile?tab=admin");
}
