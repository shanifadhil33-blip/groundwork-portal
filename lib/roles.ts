/** Workspace roles. 'staff' is stored for supervisors (kept for existing data); technicians see only their own jobs. */
export const ROLES = ['admin', 'staff', 'technician', 'client'] as const;
export type Role = typeof ROLES[number];
export const roleLabels: Record<Role, string> = { admin: 'Admin', staff: 'Supervisor', technician: 'Technician', client: 'Client' };
export const roleHints: Record<Role, string> = {
  admin: 'Everything, including settings and the team.',
  staff: 'Sees and assigns every job.',
  technician: 'Sees only the jobs given to them. Updates status and adds notes.',
  client: 'Sends requests and sees their own jobs.',
};
/** Office roles see and manage all work: admins and supervisors. */
export const isOffice = (role: string | null | undefined) => role === 'admin' || role === 'staff';

/** Fluid roles: everything a person holds, main role first. Permissions are the union, which is the main role
 * (admin covers supervisor covers technician); the technician role adds the worker side (My day, My jobs). */
export const allRoles = (m: { role?: string | null; extra_roles?: string[] | null } | null | undefined) => m?.role ? [m.role, ...(m.extra_roles ?? [])] : [];
export const doesJobs = (m: { role?: string | null; extra_roles?: string[] | null } | null | undefined) => allRoles(m).includes('technician');
/** Plain words for a person's roles, like "Admin, Supervisor and Technician". */
export function rolesLabel(m: { role?: string | null; extra_roles?: string[] | null }) { const l = allRoles(m).map(r => roleLabels[r as Role] ?? r); return l.length > 1 ? `${l.slice(0, -1).join(', ')} and ${l.at(-1)}` : l[0] ?? ''; }
