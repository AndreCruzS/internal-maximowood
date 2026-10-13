/** Asks the server to email IT about a new hire or an offboarding (sent once; quietly skipped if email isn't set up). */
export async function notifyIt(kind: "new_hire" | "offboarding", id: string): Promise<"sent" | "failed" | "skipped" | "error"> {
  try {
    const res = await fetch("/api/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, id }), keepalive: true });
    const json = (await res.json().catch(() => ({}))) as { status?: "sent" | "failed" | "skipped" };
    return res.ok && json.status ? json.status : "error";
  } catch {
    return "error";
  }
}
