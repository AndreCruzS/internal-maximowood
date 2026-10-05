import { Building2, Calculator, Package, Tag, Users, type LucideIcon } from "lucide-react";

/**
 * Every tool the portal links to. The portal home renders these as tiles,
 * grouped by `group` in GROUPS order — adding a tool is one entry here (plus
 * its page, unless `external`).
 */
export type Tool = {
  name: string;
  description: string;
  icon: LucideIcon;
  /** In-app path, or a full URL when `external`. */
  href: string;
  group: ToolGroup;
  /** Opens in a new tab with an ↗ marker. */
  external?: boolean;
  /** Only shown to admins. */
  adminOnly?: boolean;
};

export type ToolGroup = "sales" | "stock" | "admin";

export const GROUPS: { id: ToolGroup; label: string; note?: string }[] = [
  { id: "sales", label: "Sales", note: "Your quotes will be saved to your profile." },
  { id: "stock", label: "Stock" },
  { id: "admin", label: "Admin" },
];

export const TOOLS: Tool[] = [
  { name: "Retail Calculator", description: "Thermowood, hardwood & Accoya quotes", icon: Calculator, href: "/calculator", group: "sales" },
  { name: "B2B Calculator", description: "Distributor & dealer quotes", icon: Building2, href: "/b2b", group: "sales" },
  { name: "Pricing", description: "Price list", icon: Tag, href: "/pricing", group: "sales" },
  { name: "Inventory", description: "Live stock by branch", icon: Package, href: "/inventory", group: "stock" },
  { name: "Team logins", description: "Create & manage accounts", icon: Users, href: "/profile?tab=admin", group: "admin", adminOnly: true },
];
