import { DEPARTMENTS, OFFICES } from "@/lib/intranet";
import type { IntranetPerson, RipplingLeave, RipplingWorker } from "@/lib/rippling";

/**
 * Sample Rippling data, used until RIPPLING_API_TOKEN is set so HR can try the preview
 * and the mapping editor. Built from the intranet's own US people (same emails, titles and
 * managers) plus a few made-up workers. Every id starts with "demo_"; sample data is only
 * ever previewed, never written.
 */
const ENTITY: Record<string, string> = { lumberplus: "Lumber Plus LLC", maximo: "Maximo Wood LLC", us4pro: "US4 Pro LLC", builderexpress: "Builder Express LLC" };
const LOCATION: Record<string, string> = { aventura: "Aventura HQ", "lumberplus-miami": "Miami Warehouse", "lumberplus-houston": "Houston Branch", remote: "Remote (US)" };

const addDays = (ymd: string, n: number) => {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function demoRippling(people: IntranetPerson[], today: string): { workers: RipplingWorker[]; leave: RipplingLeave[] } {
  const us = people
    .filter(p => p.active && p.email && p.office && p.office !== "curitiba")
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
    .slice(0, 15);
  const idOf = new Map(us.map((p, i) => [p.id, `demo_w_${String(i + 1).padStart(3, "0")}`]));
  const deptName = (id: string | null) => (id ? DEPARTMENTS.find(d => d.id === id)?.name ?? id : null);
  const workers: RipplingWorker[] = us.map(p => ({
    id: idOf.get(p.id)!,
    fullName: p.full_name,
    workEmail: p.email,
    personalEmail: null,
    title: p.position?.title ?? "",
    department: deptName(p.position?.department_id ?? null),
    managerId: p.manager_person_id ? idOf.get(p.manager_person_id) ?? null : null,
    startDate: p.start_date,
    endDate: null,
    status: "active",
    location: (p.office && LOCATION[p.office]) ?? OFFICES.find(o => o.id === p.office)?.name ?? null,
    entity: (p.company_id && ENTITY[p.company_id]) ?? "GMX Group LLC",
  }));
  const boss = workers[0]?.id ?? null;
  workers.push(
    { id: "demo_w_new01", fullName: "Taylor Brooks", workEmail: "taylor.brooks@example.com", personalEmail: "taylor.brooks.personal@example.com", title: "Sales Representative", department: "Commercial / Sales", managerId: boss, startDate: addDays(today, 7), endDate: null, status: "hired", location: "Aventura HQ", entity: "Lumber Plus LLC" },
    { id: "demo_w_old01", fullName: "Jordan Reyes", workEmail: "jordan.reyes@example.com", personalEmail: null, title: "Warehouse Associate", department: "Warehouse", managerId: null, startDate: "2024-03-04", endDate: null, status: "active", location: "Miami Warehouse", entity: "Lumber Plus LLC" },
    { id: "demo_w_term01", fullName: "Casey Morgan", workEmail: "casey.morgan@example.com", personalEmail: null, title: "Driver", department: "Logistics", managerId: null, startDate: "2023-06-12", endDate: addDays(today, -3), status: "terminated", location: "Houston Branch", entity: "Lumber Plus LLC" },
  );
  const leave: RipplingLeave[] = workers[0] && workers[0].id !== "demo_w_new01"
    ? [{ id: "demo_leave_001", workerId: workers[0].id, startDate: addDays(today, 10), endDate: addDays(today, 14), status: "approved", type: "Vacation" }]
    : [];
  return { workers, leave };
}
