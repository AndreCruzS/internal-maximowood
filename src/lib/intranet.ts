import {
  BarChart3,
  ClipboardList,
  Briefcase,
  Calculator,
  Factory,
  Landmark,
  Megaphone,
  Monitor,
  Package,
  PackageOpen,
  Images,
  Receipt,
  Store,
  Ruler,
  Tag,
  Truck,
  Users,
  Plane,
  UserPlus,
  CalendarCheck,
  CalendarRange,
  type LucideIcon,
} from "lucide-react";

/**
 * GMX Group Intranet structure: companies, departments and the tools each
 * department uses. Ids match the `companies` / `departments` tables in
 * supabase/gmx/0001_baseline.sql. Adding a built-in tool is one entry in
 * TOOLS; links to other platforms will be managed from the admin screen.
 */

export const BRAND = {
  name: "GMX Group Intranet",
  tagline: "Making sustainability our business.",
  green: "#009f67",
  greenDark: "#00704a",
  ink: "#000000",
} as const;

export type CompanyId = "gmx" | "maximo" | "lumberplus" | "us4pro" | "builderexpress" | "globallbm";

/**
 * Companies (brands), with their official primary colors (brand guides; Builder
 * Express and Global LBM sampled from their logos). `color` is for fills and
 * stripes, `ink` is a shade that stays readable as text on white, and
 * `onColor` is the text color to use on a `color` fill.
 */
export const COMPANIES: { id: CompanyId; name: string; color: string; ink: string; onColor: string }[] = [
  { id: "gmx", name: "GMX Group", color: "#009f67", ink: "#00704a", onColor: "#ffffff" },
  { id: "maximo", name: "Maximo", color: "#f6ca21", ink: "#8a6a00", onColor: "#000000" },
  { id: "lumberplus", name: "Lumber Plus", color: "#f6b015", ink: "#8a5a00", onColor: "#000000" },
  { id: "us4pro", name: "US4", color: "#2573f2", ink: "#1f5fd0", onColor: "#ffffff" },
  { id: "builderexpress", name: "Builder Express", color: "#09adbe", ink: "#077f8c", onColor: "#ffffff" },
  { id: "globallbm", name: "Global LBM", color: "#4bc660", ink: "#1c453a", onColor: "#ffffff" },
];

export type DepartmentId = "commercial" | "marketing" | "operations" | "logistics" | "finance" | "hr" | "it";

export type Department = { id: DepartmentId; name: string; icon: LucideIcon; description: string };

export const DEPARTMENTS: Department[] = [
  { id: "commercial", name: "Commercial / Sales", icon: Briefcase, description: "Quotes, pricing and stock for the sales teams." },
  { id: "marketing", name: "Marketing", icon: Megaphone, description: "Campaign data, brand assets and marketing tools." },
  { id: "operations", name: "Operations", icon: Factory, description: "Production, quality and day-to-day operations." },
  { id: "logistics", name: "Logistics", icon: Truck, description: "Shipping, receiving and warehouse coordination." },
  { id: "finance", name: "Finance / Accounting", icon: Landmark, description: "Billing, payments, reporting and accounting." },
  { id: "hr", name: "HR", icon: Users, description: "People, policies, benefits and onboarding." },
  { id: "it", name: "IT", icon: Monitor, description: "Accounts, devices, software and help." },
];

/** Email domains that may have an account (same list as allowed_email_domains in the database). */
export const ALLOWED_EMAIL_DOMAINS = [
  "gmxgroup.com", "gmxgroup.us",
  "maximowood.com", "maximowood.us",
  "lumberplus.com", "lumberplus.us",
  "us4pro.com", "us4pro.us",
] as const;

export const isCompanyEmail = (email: string) =>
  (ALLOWED_EMAIL_DOMAINS as readonly string[]).includes(email.trim().toLowerCase().split("@")[1] ?? "");

export type OfficeId = "curitiba" | "aventura" | "lumberplus-miami" | "lumberplus-houston" | "remote";

/** Offices (same ids as the people.office check in 0006). `timeZone` shows each person's local time. */
export const OFFICES: { id: OfficeId; name: string; place: string; timeZone: string | null }[] = [
  { id: "curitiba", name: "Curitiba", place: "Curitiba, PR · Brazil", timeZone: "America/Sao_Paulo" },
  { id: "aventura", name: "Aventura", place: "Aventura, FL · United States", timeZone: "America/New_York" },
  { id: "lumberplus-miami", name: "Lumber Plus Miami", place: "Miami, FL · United States", timeZone: "America/New_York" },
  { id: "lumberplus-houston", name: "Lumber Plus Houston", place: "Houston, TX · United States", timeZone: "America/Chicago" },
  { id: "remote", name: "Remote", place: "Remote location", timeZone: null },
];
export const officeById = (id: string | null | undefined) => OFFICES.find(o => o.id === id);

/** Languages people can list on their profile. */
export const LANGUAGES = ["English", "Português", "Español", "Italiano", "Français", "Deutsch"] as const;

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Whole years since a "YYYY-MM-DD" start date (0 in the first year). */
export function yearsSince(startDate: string, today = new Date()): number {
  const [y, m, d] = startDate.split("-").map(Number);
  let years = today.getFullYear() - y;
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) years--;
  return Math.max(0, years);
}

export const departmentById = (id: string) => DEPARTMENTS.find(d => d.id === id);
export const companyName = (id: CompanyId) => COMPANIES.find(c => c.id === id)?.name ?? id;
/** Brand color; group-wide items (no company) use GMX green. */
export const companyColor = (id: string | null | undefined) => COMPANIES.find(c => c.id === id)?.color ?? "#009f67";
/** Brand shade that reads well as text or icons on white. */
export const companyInk = (id: string | null | undefined) => COMPANIES.find(c => c.id === id)?.ink ?? "#00704a";
/** Text color on a brand-color fill. */
export const companyOnColor = (id: string | null | undefined) => COMPANIES.find(c => c.id === id)?.onColor ?? "#ffffff";

export type Tool = {
  name: string;
  description: string;
  icon: LucideIcon;
  /** In-app path, or a full URL when `external`. */
  href: string;
  department: DepartmentId;
  company: CompanyId;
  /** Opens in a new tab with an ↗ marker. */
  external?: boolean;
  /** Shown in the home page's Quick links. */
  pinned?: boolean;
};

export const TOOLS: Tool[] = [
  { name: "Quote Builder", description: "Retail & B2B quotes, and your saved ones", icon: Calculator, href: "/calculator", department: "commercial", company: "maximo", pinned: true },
  { name: "Tally Calculator", description: "Split an order into packs per length, from live stock", icon: Ruler, href: "/tally", department: "commercial", company: "maximo", pinned: true },
  { name: "Sample Requester", description: "Request product samples for customers", icon: PackageOpen, href: "https://samples.maximowood.com/samples", department: "commercial", company: "maximo", external: true },
  { name: "Pricing", description: "Maximo price list", icon: Tag, href: "/pricing", department: "commercial", company: "maximo" },
  { name: "Inventory", description: "Live stock by branch", icon: Package, href: "/inventory", department: "commercial", company: "maximo", pinned: true },
  { name: "Orders", description: "GMX logistics order platform", icon: ClipboardList, href: "https://orders.gmxgroup.com/", department: "logistics", company: "gmx", external: true, pinned: true },
  { name: "Data Center", description: "Ads & campaign dashboard", icon: BarChart3, href: "https://maximo-ads-dashboard.vercel.app/login", department: "marketing", company: "maximo", external: true, pinned: true },
  { name: "Expenses", description: "Receipts, reimbursements, cards and fund requests, connected to Ramp", icon: Receipt, href: "/expenses", department: "finance", company: "gmx" },
  { name: "Vendors", description: "Approved vendor Master List, bank import and OFAC sanctions check", icon: Store, href: "/vendors", department: "finance", company: "gmx", pinned: true },
  { name: "Request a Vendor", description: "Ask for a new vendor: department head, OFAC check, approval, then Payments", icon: Store, href: "/vendors/request", department: "finance", company: "gmx", pinned: true },
  { name: "Travel Requests", description: "Request business travel; Procurement books it", icon: Plane, href: "/travel", department: "finance", company: "gmx", pinned: true },
  { name: "Refer a Candidate", description: "Refer someone for an open role", icon: UserPlus, href: "/refer", department: "hr", company: "gmx" },
  { name: "Time Off & Pay", description: "Request time off, approve your team's, and pay & benefits in Rippling", icon: CalendarCheck, href: "/hr", department: "hr", company: "gmx", pinned: true },
  { name: "Holidays & Absences", description: "Office holidays, opening hours and time off", icon: CalendarRange, href: "/holidays", department: "hr", company: "gmx" },
  { name: "Online Gallery", description: "Maximo photos and media library", icon: Images, href: "https://media.maximowood.com/", department: "marketing", company: "maximo", external: true },
];

export const toolsFor = (department: DepartmentId) => TOOLS.filter(t => t.department === department);
