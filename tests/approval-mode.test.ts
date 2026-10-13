import { describe, it, expect } from 'vitest';
import { labelsFor, rolesLabel } from '../lib/roles';
import { actionSummary, actionResult } from '../lib/ui/assistant-replies';
import { roleNames } from '../lib/services/workspaces';
describe('role names and approval mode', () => {
  it('uses the company names with fallback', () => {
    const l = labelsFor({ technician: ' Fixer ', staff: '' });
    expect(l.technician).toBe('Fixer'); expect(l.staff).toBe('Supervisor');
    expect(rolesLabel({ role: 'admin', extra_roles: ['technician'] }, l)).toBe('Admin and Fixer');
  });
  it('validates role names', () => {
    expect(roleNames.safeParse({ technician: 'Fixer' }).success).toBe(true);
    expect(roleNames.safeParse({ technician: 'x'.repeat(41) }).success).toBe(false);
  });
  it('has plain card words for the new tools', () => {
    expect(actionSummary('set_approval_mode', { approval_mode: 'every' } as any)).toMatch(/every change/);
    expect(actionSummary('rename_role', { role: 'technician', name: 'Fixer' } as any)).toBe('Call the Technician role Fixer');
    expect(actionResult('rename_role', { role: 'technician', name: 'Fixer' } as any)).toMatch(/now called Fixer/);
  });
});
