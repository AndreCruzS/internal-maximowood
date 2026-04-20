export type SystemSlug = "maximo" | (string & {});

export type UserSystemAccess = {
  systemSlug: SystemSlug;
  role: string;
  permissions: string[];
};

export type PlatformUser = {
  id: string;
  email: string | null;
  name?: string | null;
  systems: UserSystemAccess[];
};

export function canAccessSystem(user: PlatformUser | null, system: SystemSlug): boolean {
  if (!user) return false;
  return user.systems.some((s) => s.systemSlug === system);
}

export function hasPermission(
  user: PlatformUser | null,
  system: SystemSlug,
  permission: string,
): boolean {
  if (!user) return false;
  const access = user.systems.find((s) => s.systemSlug === system);
  return access?.permissions.includes(permission) ?? false;
}
