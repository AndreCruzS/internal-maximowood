import {
  BarChart3,
  ClipboardList,
  FileText,
  Briefcase,
  Building2,
  Calculator,
  Factory,
  Landmark,
  Megaphone,
  Monitor,
  Package,
  Tag,
  Truck,
  Users,
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

export type CompanyId = "gmx" | "maximo" | "lumberplus" | "us4pro" | "builderexpress";

export const COMPANIES: { id: CompanyId; name: string }[] = [
  { id: "gmx", name: "GMX Group" },
  { id: "maximo", name: "Maximo" },
  { id: "lumberplus", name: "Lumber Plus" },
  { id: "us4pro", name: "US4" },
  { id: "builderexpress", name: "Builder Express" },
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

export type OfficeId = "curitiba" | "aventura" | "lumberplus-miami" | "remote";

/** Offices (same ids as the people.office check in 0006). `timeZone` shows each person's local time. */
export const OFFICES: { id: OfficeId; name: string; place: string; timeZone: string | null }[] = [
  { id: "curitiba", name: "Curitiba", place: "Curitiba, PR · Brazil", timeZone: "America/Sao_Paulo" },
  { id: "aventura", name: "Aventura", place: "Aventura, FL · United States", timeZone: "America/New_York" },
  { id: "lumberplus-miami", name: "Lumber Plus Miami", place: "Miami, FL · United States", timeZone: "America/New_York" },
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
  { name: "Retail Calculator", description: "Thermowood, hardwood & Accoya quotes", icon: Calculator, href: "/calculator", department: "commercial", company: "maximo", pinned: true },
  { name: "B2B Calculator", description: "Distributor & dealer quotes", icon: Building2, href: "/b2b", department: "commercial", company: "maximo", pinned: true },
  { name: "My Quotes", description: "Your saved quotes — reopen, download, edit", icon: FileText, href: "/quotes", department: "commercial", company: "maximo", pinned: true },
  { name: "Pricing", description: "Maximo price list", icon: Tag, href: "/pricing", department: "commercial", company: "maximo" },
  { name: "Inventory", description: "Live stock by branch", icon: Package, href: "/inventory", department: "commercial", company: "maximo", pinned: true },
  { name: "Orders", description: "GMX logistics order platform", icon: ClipboardList, href: "https://orders.gmxgroup.com/", department: "logistics", company: "gmx", external: true, pinned: true },
  { name: "Data Center", description: "Ads & campaign dashboard", icon: BarChart3, href: "https://maximo-ads-dashboard.vercel.app/login", department: "marketing", company: "maximo", external: true, pinned: true },
];

export const toolsFor = (department: DepartmentId) => TOOLS.filter(t => t.department === department);
