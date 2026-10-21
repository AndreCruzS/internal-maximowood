import { describe, expect, it } from "vitest";
import { leaveStatus, lookupFrom, normalizeLeave, normalizeWorker, workerStatus } from "./fields";
import { demoRippling } from "./demo";
import type { IntranetPerson } from "@/lib/rippling";

describe("Rippling field mapping (unverified names, read defensively)", () => {
  it("reads a worker with nested user / name objects and id lookups", () => {
    const w = normalizeWorker(
      {
        id: "W1", user: { name: { given_name: "Ana", family_name: "Lima" }, work_email: "Ana@GMX.com" }, title: "Seller",
        department_id: "D1", manager_id: "W0", start_date: "2024-02-01T00:00:00Z", status: "ACTIVE", work_location: { id: "L1" }, legal_entity: { name: "Lumber Plus LLC" },
      },
      { departments: lookupFrom([{ id: "D1", name: "Sales" }]), locations: lookupFrom([{ id: "L1", name: "Miami Warehouse" }]) },
    );
    expect(w).toMatchObject({ id: "W1", fullName: "Ana Lima", workEmail: "ana@gmx.com", title: "Seller", department: "Sales", managerId: "W0", startDate: "2024-02-01", status: "active", location: "Miami Warehouse", entity: "Lumber Plus LLC" });
  });
  it("skips rows without an id and maps statuses", () => {
    expect(normalizeWorker({ title: "x" })).toBeNull();
    expect(workerStatus("TERMINATED")).toBe("terminated");
    expect(workerStatus("HIRED")).toBe("hired");
    expect(workerStatus("INACTIVE")).toBe("terminated");
    expect(workerStatus("weird")).toBe("other");
  });
  it("reads leave requests", () => {
    expect(normalizeLeave({ id: "R1", role: "W1", start_date: "2026-11-01", end_date: "2026-11-03", status: "APPROVED", leave_type_name: "PTO" }))
      .toEqual({ id: "R1", workerId: "W1", startDate: "2026-11-01", endDate: "2026-11-03", status: "approved", type: "PTO" });
    expect(normalizeLeave({ id: "R2", start_date: "2026-11-01" })).toBeNull();
    expect(leaveStatus("REJECTED")).toBe("declined");
    expect(leaveStatus("CANCELED")).toBe("cancelled");
  });
});

describe("sample data", () => {
  const p = (id: string, office: string | null, email: string | null): IntranetPerson => ({
    id, full_name: id, email, rippling_id: null, start_date: null, office, company_id: "lumberplus", active: true,
    position: { id: `pos-${id}`, title: "Seller", department_id: "commercial", reports_to: null }, manager_person_id: null, open_offboarding: false,
  });
  it("mirrors US people only, uses demo_ ids, and is deterministic", () => {
    const people = [p("b", "aventura", "b@x.com"), p("a", "lumberplus-miami", "a@x.com"), p("br", "curitiba", "br@x.com"), p("noemail", "aventura", null)];
    const one = demoRippling(people, "2026-10-21");
    expect(one).toEqual(demoRippling(people, "2026-10-21"));
    expect(one.workers.every(w => w.id.startsWith("demo_"))).toBe(true);
    expect(one.workers.filter(w => w.workEmail?.endsWith("@x.com")).map(w => w.workEmail)).toEqual(["a@x.com", "b@x.com"]);
    expect(one.leave.every(l => l.id.startsWith("demo_"))).toBe(true);
  });
});
