import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
// Adhil's rule: nothing facing users is labelled "optional". Model facing tool descriptions in lib/agent are not shown to users.
const roots = ['app', 'components'];
const files = (d: string): string[] => readdirSync(d).flatMap(n => { const p = join(d, n); return statSync(p).isDirectory() ? files(p) : /\.tsx$/.test(n) ? [p] : []; });
it('user facing copy never says optional', () => {
  const hits: string[] = [];
  for (const f of roots.flatMap(files)) {
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    // Visible text: JSX text nodes and string literals; ignore code identifiers like .optional() or ?: types.
    for (const m of src.matchAll(/>([^<>{}]*)<|'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)) {
      const t = m[1] ?? m[2] ?? m[3] ?? m[4] ?? '';
      if (/\boptional\b/i.test(t) && !/^[\w.-]+$/.test(t.trim())) hits.push(`${f}: ${t.trim().slice(0, 80)}`);
    }
  }
  expect(hits).toEqual([]);
});
