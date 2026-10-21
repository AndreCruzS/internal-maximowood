/** Ask the server to email about a time-off request (manager on "requested", the person on "decided"). Fire and forget. */
export const notifyTimeOff = (id: string, event: "requested" | "decided") =>
  fetch("/api/time-off/notify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, event }) }).catch(() => null);
