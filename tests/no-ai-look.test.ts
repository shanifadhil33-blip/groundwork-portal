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
  if (file.endsWith('.css') && !file.startsWith('components/landing/')) {
    // Inspect shared rules too: their declarations can cascade into signed in pages.
    // Global tokens and public rules in globals.css must meet the same minimum.
    const css = source.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' '));
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = rule[1].trim();
      if (file !== 'app/globals.css' && (selector === ':root' || selector === '[data-theme=dark]' || selector.split(',').every(part => /\.(?:landing|hero|public-|preview-|editorial-|persona-|auth-|product-preview)/.test(part)))) continue;
      const declarations = rule[2];
      for (const weight of declarations.matchAll(/font-weight\s*:\s*([^;}]+)/g)) {
        if (!/^(?:400|500|600)(?:\s*!important)?\s*$/.test(weight[1])) report(rule.index! + rule[0].indexOf(declarations) + weight.index!, 'Use only font weights 400, 500 and 600');
      }
      for (const shorthand of declarations.matchAll(/font\s*:\s*([^;}]+)/g)) {
        const weight = /(?:^|\s)([1-9]\d{2}|bold|bolder|lighter)(?=\s)/.exec(shorthand[1]);
        if (weight && !['400','500','600'].includes(weight[1])) report(rule.index! + rule[0].indexOf(declarations) + shorthand.index!, 'Use only font weights 400, 500 and 600');
      }
      for (const declaration of declarations.matchAll(/(?:font-size|font|--(?:text|type)-[\w-]+)\s*:\s*([^;}]+)/g)) {
        for (const size of declaration[1].matchAll(/(?<![\w.-])(\d*\.?\d+)(px|rem|em|pt)\b/g)) {
          const pixels = Number(size[1]) * (size[2] === 'px' ? 1 : size[2] === 'pt' ? 4 / 3 : 16);
          if (pixels < 14) report(rule.index! + rule[0].indexOf(declarations) + declaration.index!, 'Signed in text must be at least 14px');
          // Font shorthand can include a smaller line height after the size.
          if (declaration[0].startsWith('font:')) break;
        }
      }
    }
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

it('rejects small signed in CSS text, including shared rules and type tokens', () => {
  for (const source of [
    '.app-main p { font-size: 13px; }',
    '@media(max-width:640px) { .nav-link { font-size: 12px; } }',
    'body:has(.app-shell) { --text-xs: 11px; }',
    '.comment { font-size: .8rem; }',
    '.comment { font: 500 13px/20px sans-serif; }',
  ]) expect(violations('app/globals.css', source)).toEqual(expect.arrayContaining([expect.stringContaining('Signed in text must be at least 14px')]));
  expect(violations('app/globals.css', '.app-main { font-size: 14px; }')).toEqual([]);
  expect(violations('app/globals.css', '.landing p { font-size: 12px; }')).toHaveLength(1);
  expect(violations('components/landing/example.css', 'p { font-size: 12px; }')).toEqual([]);
});

it('rejects small root tokens and unsupported font weights throughout globals.css', () => {
  expect(violations('app/globals.css', ':root { --text-xs: 13px; }')).toHaveLength(1);
  for (const weight of ['300', '550', '650', '700', 'bold']) {
    expect(violations('app/globals.css', `.badge { font-weight: ${weight}; }`)).toEqual(expect.arrayContaining([expect.stringContaining('Use only font weights 400, 500 and 600')]));
  }
  expect(violations('app/globals.css', '.badge { font: 700 14px sans-serif; }')).toHaveLength(1);
  for (const weight of [400, 500, 600]) expect(violations('app/globals.css', `.badge { font-weight: ${weight}; font-size: 14px; }`)).toEqual([]);
});
