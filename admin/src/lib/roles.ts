/**
 * Role-aware UI. This MIRRORS the server's gates (server/src/admin/*: the `min` role of each route); the server is the authority,
 * this only hides or disables what the signed-in role cannot do. Keep it in sync with docs/ADMIN.md (permissions matrix).
 */
export const ROLES = ['viewer', 'support', 'admin', 'owner'] as const;
export type Role = (typeof ROLES)[number];

export const rank = (r: Role | null | undefined): number => (r ? ROLES.indexOf(r) + 1 : 0);

export const ACTIONS = {
  view_dashboard: 'viewer',
  view_users: 'viewer',
  view_tickets: 'viewer',
  view_config: 'viewer',
  view_abuse: 'viewer',
  view_monitoring: 'viewer',
  view_reports: 'viewer',
  export_reports: 'viewer',
  manage_tickets: 'support',
  add_user_note: 'support',
  suspend_user: 'support',
  signout_user: 'support',
  manage_blocklist: 'support',
  moderate_rishtey: 'support', // approve/reject community profiles and handle reports; the only place staff see a profile (public details only)
  view_consented_data: 'support',
  unmask_user: 'admin',
  delete_user: 'admin',
  edit_config: 'admin',
  recompute_reports: 'admin',
  view_audit: 'admin',
  manage_staff: 'owner',
} as const satisfies Record<string, Role>;
export type Action = keyof typeof ACTIONS;

export function can(role: Role | null | undefined, action: Action): boolean {
  return rank(role) >= rank(ACTIONS[action]);
}

export const isRole = (v: unknown): v is Role => typeof v === 'string' && (ROLES as readonly string[]).includes(v);

export const ROLE_LABEL: Record<Role, string> = { viewer: 'Viewer', support: 'Support', admin: 'Admin', owner: 'Owner' };
