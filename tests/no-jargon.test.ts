import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
// Plain words only. "Dispatch" is office jargon: say "Plan the day" or "Assign jobs".
const JARGON = /(?<![\w.])Dispatch(?:ing|ed|er)?\b(?![\w(<])/;
function files(dir: string): string[] { return readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : /\.(tsx|ts)$/.test(f) ? [p] : []; }); }
it('user facing copy has no jargon like Dispatch', () => {
  const hits: string[] = [];
  for (const f of [...files('app'), ...files('components'), ...files('lib/ui')].filter(f => !/\.test\./.test(f))) {
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    for (const m of src.matchAll(/(['"`>])([^'"`<>{}]*)(?=['"`<])/g)) if (JARGON.test(m[2])) hits.push(`${f}: ${m[2].trim().slice(0, 60)}`);
  }
  expect(hits).toEqual([]);
});

it('customer contacts never reuse the maintenance office role label',()=>{
 const hits=[...files('components'),...files('lib')].filter(f=>/client|demo-picker|assistant|design-copy|role-tools/.test(f)).filter(f=>/client office staff/i.test(readFileSync(f,'utf8')));expect(hits).toEqual([]);
});
