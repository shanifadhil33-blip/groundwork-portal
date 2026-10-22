import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('services can only restore the caller or clear the actor for system delivery', () => {
  const root = join(process.cwd(), 'lib/services');
  const unexpected: string[] = [];
  for (const file of readdirSync(root, { recursive: true })) {
    if (typeof file !== 'string' || !file.endsWith('.ts')) continue;
    const source = readFileSync(join(root, file), 'utf8');
    // Match every app.user_id setter, including multiline calls, and allow only
    // the existing caller restoration and system notification delivery forms.
    for (const match of source.matchAll(/set_config\s*\(\s*['"]app\.user_id['"][\s\S]*?;/g)) {
      if (!/^set_config\('app\.user_id',(?:\$1,true\)"\s*,\s*\[user\]\s*\)|'',true\)"\s*\));$/.test(match[0])) unexpected.push(`${file}: ${match[0]}`);
    }
  }
  expect(unexpected).toEqual([]);
});
