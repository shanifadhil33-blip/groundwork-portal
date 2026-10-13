import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const root = fileURLToPath(new URL('../', import.meta.url));
const forbiddenIcon = /\b(?:Sparkles|WandSparkles|Wand2|Wand|Sparkle|Stars)\b/;
function violations(file: string, source: string): string[] {
  const hits: string[] = [];
  const report = (offset: number, reason: string) => hits.push(`${file}:${source.slice(0, offset).split('\n').length}: ${reason}`);
  for (const match of source.matchAll(/import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"]lucide-react['"]/g)) {
    const icon = forbiddenIcon.exec(match[1]);
    if (icon) report(match.index! + match[0].indexOf(match[1]) + icon.index, `Remove ${icon[0]} from lucide-react`);
  }
  for (const match of source.matchAll(/✨/gu)) report(match.index!, 'Remove sparkle emoji');
  // The landing can keep its visual treatment, but never its sparkle icons.
  if (!file.startsWith('components/landing/')) {
    const patterns: [RegExp, string][] = [
      [/(?:radial-gradient|(?:repeating-)?linear-gradient)\s*\(/g, 'Use a solid app surface instead of a gradient'],
      [/\bbg-gradient-[\w-]+/g, 'Remove gradient background utility'],
      [/(?<![\w-])(?:filter|WebkitFilter)\s*[:=]\s*['"]?[^;\n}]*\bblur\s*\(/g, 'Remove blurred glow'],
      [/text-transparent\s+bg-clip-text|bg-clip-text\s+text-transparent/g, 'Remove gradient text'],
      [/className\s*=\s*["'][^"']*\b(?:eyebrow|kicker)\b[^"']*["']/g, 'Remove eyebrow label'],
      [/className\s*=\s*["'][^"']*\buppercase\b[^"']*["']/g, 'Remove uppercase eyebrow styling'],
      [/(?:\.(?:eyebrow|kicker)[^{]*\{[^}]*text-transform\s*:\s*uppercase|text-transform\s*:\s*uppercase)/g, 'Remove uppercase label styling'],
    ];
    for (const [pattern, reason] of patterns) for (const match of source.matchAll(pattern)) report(match.index!, reason);
  }
  return hits;
}
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules') return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.(?:[cm]?[jt]sx?|css|svg)$/.test(entry.name) ? [path] : [];
  });
}
it('keeps sparkle icons and generic AI treatments out of the product', () => {
  const found = ['app', 'components', 'lib/ui'].flatMap(directory => files(join(root, directory)))
    .flatMap(file => violations(relative(root, file).replaceAll('\\', '/'), readFileSync(file, 'utf8')));
  expect(found, `Design violations:\n${found.join('\n')}`).toEqual([]);
});
it('reports multiline icon imports, glow styles and eyebrow labels with file and line', () => {
  expect(violations('components/app/example.tsx', `import {\n Sparkles as Magic\n} from 'lucide-react';\n<div className="text-xs uppercase">✨</div>\n<style>filter: blur(40px); background: radial-gradient(red, blue)</style>`)).toEqual(expect.arrayContaining([
    'components/app/example.tsx:2: Remove Sparkles from lucide-react',
    'components/app/example.tsx:4: Remove sparkle emoji',
    'components/app/example.tsx:4: Remove uppercase eyebrow styling',
    'components/app/example.tsx:5: Remove blurred glow',
    'components/app/example.tsx:5: Use a solid app surface instead of a gradient',
  ]));
  expect(violations('components/landing/example.css', 'background: linear-gradient(red, blue)')).toEqual([]);
  expect(violations('components/landing/example.tsx', `import { Wand2 } from 'lucide-react'`)).toHaveLength(1);
  expect(violations('app/example.css', 'backdrop-filter: blur(8px)')).toEqual([]);
});
