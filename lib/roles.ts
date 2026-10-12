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
