import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DOC_MAX_BYTES, DOC_TYPES, DOCS_PER_COMPANY } from '../lib/services/documents';
import { providerOnlyPath, officeOnlyPath } from '../lib/ui/work-orders';
const sql = readFileSync('db/migrations/0021_company_documents.sql', 'utf8');
describe('company documents', () => {
  it('migration is additive and staff only', () => {
    expect(sql).not.toMatch(/\b(DROP|ALTER TABLE \w+ (DROP|ALTER))\b/i);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/USING \(is_staff\(workspace_id\)\) WITH CHECK \(is_staff\(workspace_id\)\)/);
    expect(sql).toContain('1048576');
  });
  it('keeps the storage limit small', () => { expect(DOC_MAX_BYTES).toBe(1024 * 1024); expect(DOCS_PER_COMPANY).toBeLessThanOrEqual(40); expect(DOC_TYPES).toContain('trade_licence'); });
  it('closes the page to clients and technicians', () => { expect(providerOnlyPath('/documents')).toBe(true); expect(officeOnlyPath('/documents')).toBe(true); });
  it('grants the app role access', () => { expect(readFileSync('scripts/migrate.ts', 'utf8')).toMatch(/ON company_documents TO/); });
  it('assistant tools exist and writes need confirmation', () => {
    const t = readFileSync('lib/agent/tools.ts', 'utf8');
    for (const n of ['list_documents', 'update_document', 'remove_document']) expect(t).toContain(n + ':');
    expect(t).toMatch(/remove_document:\{[^\n]*confirmation first[^\n]*write:true/);
  });
  it('daily cron also sends document reminders', () => { expect(readFileSync('app/api/cron/late-jobs/route.ts', 'utf8')).toContain('pushExpiringDocuments'); });
});
