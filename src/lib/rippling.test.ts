import { describe, expect, it } from "vitest";
import { diffRippling, leaveKind, parseRipplingSettings, planCounts, type IntranetPerson, type RipplingWorker } from "./rippling";

const person = (o: Partial<IntranetPerson> & { id: string }): IntranetPerson => ({
  full_name: o.id, email: null, rippling_id: null, start_date: null, office: null, company_id: null, active: true,
  position: null, manager_person_id: null, open_offboarding: false, ...o,
});
const worker = (o: Partial<RipplingWorker> & { id: string }): RipplingWorker => ({
  fullName: o.id, workEmail: null, personalEmail: null, title: "", department: null, managerId: null,
  startDate: null, endDate: null, status: "active", location: null, entity: null, ...o,
});
const settings = parseRipplingSettings({
  enabled: true,
  departments: { Sales: "commercial", Warehouse: "operations" },
  companies: { "Lumber Plus LLC": "lumberplus" },
  offices: { "Miami Warehouse": "lumberplus-miami" },
});
const today = "2026-10-21";

describe("parseRipplingSettings", () => {
  it("defaults to off with empty maps and drops non-string values", () => {
    expect(parseRipplingSettings(null)).toEqual({ enabled: false, departments: {}, companies: {}, offices: {} });
    expect(parseRipplingSettings({ enabled: "yes", departments: { Sales: "commercial", Bad: 3, " ": "x" } }).departments).toEqual({ Sales: "commercial" });
  });
});

describe("diffRippling", () => {
  const boss = person({ id: "p-boss", full_name: "Boss", email: "boss@gmx.com", position: { id: "pos-boss", title: "CEO", department_id: null, reports_to: null } });
  const ana = person({
    id: "p-ana", full_name: "Ana", email: "Ana@GMX.com", start_date: "2020-01-01", office: "aventura", company_id: "gmx",
    position: { id: "pos-ana", title: "Seller", department_id: "commercial", reports_to: "pos-boss" }, manager_person_id: "p-boss",
  });

  it("matches by work email (case-insensitive), links, and lists only real changes", () => {
    const plan = diffRippling(
      [
        worker({ id: "w-boss", workEmail: "boss@gmx.com", title: "CEO" }),
        worker({ id: "w-ana", workEmail: "ana@gmx.com", title: "Senior Seller", department: "Sales", managerId: "w-boss", startDate: "2020-01-01", location: "Miami Warehouse", entity: "Lumber Plus LLC" }),
      ],
      [boss, ana], settings, { today },
    );
    const u = plan.updates.find(x => x.personId === "p-ana")!;
    expect(u.link).toBe(true);
    expect(u.changes.map(c => c.field).sort()).toEqual(["company", "office", "title"]);
    expect(u.changes.find(c => c.field === "title")).toEqual({ field: "title", from: "Seller", to: "Senior Seller" });
    expect(plan.creates).toHaveLength(0);
  });

  it("prefers rippling_id over email and counts linked, unchanged people", () => {
    const linked = { ...boss, rippling_id: "w-boss", email: "old@gmx.com" };
    const plan = diffRippling([worker({ id: "w-boss", workEmail: "new@gmx.com", title: "CEO" })], [linked], settings, { today });
    expect(plan.updates).toHaveLength(0);
    expect(plan.unchanged).toBe(1);
  });

  it("never blanks a field Rippling doesn't send or that isn't mapped", () => {
    const plan = diffRippling([worker({ id: "w-ana", workEmail: "ana@gmx.com", department: "Unknown dept", entity: null, location: null, title: "" })], [{ ...ana, rippling_id: "w-ana" }], settings, { today });
    expect(plan.updates).toHaveLength(0);
    expect(plan.unmapped.departments).toEqual(["Unknown dept"]);
  });

  it("creates unmatched workers, flagging recent starts as new hires", () => {
    const plan = diffRippling(
      [
        worker({ id: "w-new", fullName: "New", status: "hired", startDate: "2026-11-02", department: "Sales" }),
        worker({ id: "w-recent", fullName: "Recent", startDate: "2026-10-01" }),
        worker({ id: "w-old", fullName: "Old", startDate: "2019-05-01" }),
      ],
      [], settings, { today },
    );
    expect(plan.creates.map(c => [c.worker.id, c.isNewHire])).toEqual([["w-new", true], ["w-recent", true], ["w-old", false]]);
    expect(plan.creates[0].departmentId).toBe("commercial");
    expect(planCounts(plan)).toMatchObject({ creates: 3, newHires: 2 });
  });

  it("offboards terminated people once and ignores terminated strangers", () => {
    const plan = diffRippling(
      [worker({ id: "w-ana", workEmail: "ana@gmx.com", status: "terminated", endDate: "2026-10-18" }), worker({ id: "w-x", status: "terminated" })],
      [ana], settings, { today },
    );
    expect(plan.leavers).toEqual([{ personId: "p-ana", name: "Ana", lastDay: "2026-10-18" }]);
    expect(plan.creates).toHaveLength(0);
    const again = diffRippling([worker({ id: "w-ana", workEmail: "ana@gmx.com", status: "terminated" })], [{ ...ana, open_offboarding: true }], settings, { today });
    expect(again.leavers).toHaveLength(0);
  });

  it("upserts approved leave for known people and cancels leave Rippling withdrew", () => {
    const plan = diffRippling([worker({ id: "w-ana", workEmail: "ana@gmx.com" })], [ana], settings, {
      today,
      leave: [
        { id: "l1", workerId: "w-ana", startDate: "2026-11-01", endDate: "2026-11-05", status: "approved", type: "Vacation" },
        { id: "l2", workerId: "w-ana", startDate: "2026-12-01", endDate: "2026-12-01", status: "cancelled", type: "Sick" },
        { id: "l3", workerId: "w-nobody", startDate: "2026-11-01", endDate: "2026-11-01", status: "approved", type: "PTO" },
        { id: "l4", workerId: "w-ana", startDate: "2026-11-09", endDate: "2026-11-09", status: "pending", type: "PTO" },
      ],
      existingLeave: [{ externalId: "l2", status: "approved" }],
    });
    expect(plan.leave.upsert).toEqual([{ externalId: "l1", personId: "p-ana", startsOn: "2026-11-01", endsOn: "2026-11-05", kind: "vacation", note: "Vacation" }]);
    expect(plan.leave.cancel).toEqual(["l2"]);
  });
});

describe("leaveKind", () => {
  it("maps Rippling leave types to absence kinds", () => {
    expect(leaveKind("Sick Leave")).toBe("sick");
    expect(leaveKind("PTO")).toBe("vacation");
    expect(leaveKind("Company Holiday")).toBe("holiday");
    expect(leaveKind("Jury duty")).toBe("ooo");
  });
});
