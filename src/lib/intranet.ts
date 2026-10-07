import {
  BarChart3,
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

export type CompanyId = "gmx" | "maximo" | "lumberplus" | "us4pro";

export const COMPANIES: { id: CompanyId; name: string }[] = [
  { id: "gmx", name: "GMX Group" },
  { id: "maximo", name: "Maximo" },
  { id: "lumberplus", name: "Lumber Plus" },
  { id: "us4pro", name: "US4" },
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
  { name: "Pricing", description: "Maximo price list", icon: Tag, href: "/pricing", department: "commercial", company: "maximo" },
  { name: "Inventory", description: "Live stock by branch", icon: Package, href: "/inventory", department: "commercial", company: "maximo", pinned: true },
  { name: "Data Center", description: "Ads & campaign dashboard", icon: BarChart3, href: "https://maximo-ads-dashboard.vercel.app/login", department: "marketing", company: "maximo", external: true, pinned: true },
];

export const toolsFor = (department: DepartmentId) => TOOLS.filter(t => t.department === department);
