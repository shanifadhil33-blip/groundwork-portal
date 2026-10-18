import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (f: string) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const walk = (dir: string): string[] => fs.readdirSync(path.join(__dirname, '..', dir), { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.tsx') ? [path.join(dir, e.name)] : []);

describe('LEARN01: the name ask and the greeting reach every person in his language', () => {
  it('never writes data-no-translate={false}: React renders it as "false", which still matches [data-no-translate] and hid the greeting from the translator', () => {
    for (const f of [...walk('components'), ...walk('app')]) expect(read(f), f).not.toMatch(/data-no-translate=\{false\}/);
  });
  it('asks and greets on the client home too, not only Today and the dashboard', () => {
    for (const f of ['components/app/client-home.tsx', 'components/app/my-day.tsx', 'components/app/dashboard.tsx']) expect(read(f), f).toMatch(/<Greeting\b/);
  });
  it('the Gulf Arabic name question reads naturally', () => {
    expect(JSON.parse(read('public/i18n/ar-AE.json'))['What should I call you?']).toBe('بماذا تحب أن أناديك؟');
  });
});
