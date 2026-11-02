import { z } from 'zod';

export const ROLES = ['viewer', 'editor', 'owner'] as const;
export const roleSchema = z.enum(ROLES);
export type Role = z.infer<typeof roleSchema>;

/** Roles that can be granted to other people; ownership is never shared. */
export const GRANTABLE_ROLES = ['viewer', 'editor'] as const;
export const grantableRoleSchema = z.enum(GRANTABLE_ROLES);
export type GrantableRole = z.infer<typeof grantableRoleSchema>;

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, owner: 3 };

/** Returns true when `role` grants at least the permissions of `minimum`. */
export function hasRoleAtLeast(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

/** Returns the stronger of two roles, treating `null` as no access. */
export function strongerRole(a: Role | null, b: Role | null): Role | null {
  if (a === null) return b;
  if (b === null) return a;
  return ROLE_RANK[a] >= ROLE_RANK[b] ? a : b;
}
