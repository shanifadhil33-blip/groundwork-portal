import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Design system rules (handoff Part E, section 11).
 * app/tokens.css is the only place for a raw colour, font size, duration or easing.
 */
const TOKENS = 'app/tokens.css';
/** The public landing page keeps its own dark art direction. Its palette moves into tokens with the landing rework. */
const LANDING = /^(components\/landing\/|lib\/landing\/|app\/page\.tsx$)/;
/** Inline style is allowed only where a value is measured at run time. */
const INLINE_STYLE_ALLOWED = new Set(['components/ui/button.tsx', 'components/ui/dropdown.tsx', 'components/ui/date-picker.tsx', 'components/ui/dialog.tsx', 'components/app/dashboard.tsx']);
/** The brand mark is the one hand drawn icon. Everything else is lucide. */
const SVG_ALLOWED = new Set(['components/public/chrome.tsx']);

function walk(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, pattern) : pattern.test(name) ? [path] : [];
  });
}
const read = (file: string) => readFileSync(file, 'utf8');
const styles = [...walk('app', /\.css$/), ...walk('components', /\.css$/)].filter(f => f !== TOKENS && !LANDING.test(f));
const code = [...walk('app', /\.tsx?$/), ...walk('components', /\.tsx?$/)].filter(f => !LANDING.test(f));
const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
/** Every `prop: value` pair in a stylesheet, with the file for the failure message. */
function declarations(file: string) {
  return [...withoutComments(read(file)).matchAll(/(?:^|[;{\s])([a-z-]+)\s*:\s*([^;{}]+)/g)].map(m => ({ file, prop: m[1], value: m[2].trim() }));
}
const all = styles.flatMap(declarations);
const hits = (found: { file: string; prop?: string; value?: string }[]) => found.slice(0, 12).map(d => `${d.file}: ${d.prop ?? ''} ${d.value ?? ''}`.trim());

describe('design system', () => {
  it('has stylesheets and components to check', () => {
    expect(styles.length).toBeGreaterThan(0);
    expect(code.length).toBeGreaterThan(50);
    expect(read(TOKENS)).toContain('--dur-sheet');
  });

  it('keeps raw colours in the tokens file only', () => {
    const colour = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b|\brgba?\(|\bhsla?\(/i;
    expect(hits(all.filter(d => colour.test(d.value)))).toEqual([]);
    const inCode = code.filter(f => f !== 'app/manifest.ts').flatMap(file => read(file).split('\n').filter(line => /['"`]#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})['"`]|\brgba?\(\d/i.test(line)).map(line => ({ file, value: line.trim().slice(0, 80) })));
    expect(hits(inCode)).toEqual([]);
  });

  it('uses the four type sizes from tokens', () => {
    expect(hits(all.filter(d => d.prop === 'font-size' && !/^(var\(--t-(title|section|body|meta)\)|inherit)$/.test(d.value)))).toEqual([]);
    const inCode = code.flatMap(file => (/fontSize\s*:/.test(read(file)) ? [{ file }] : []));
    expect(hits(inCode)).toEqual([]);
  });

  it('takes every duration and easing from tokens', () => {
    const motion = all.filter(d => /^(transition|animation)/.test(d.prop));
    const literal = /\d(?:ms|s)\b|cubic-bezier|steps\(|\b(?:ease|ease-in|ease-out|ease-in-out|linear)\b(?!\))/;
    expect(hits(motion.filter(d => literal.test(d.value.replace(/var\(--[a-z0-9-]+\)/g, ''))))).toEqual([]);
  });

  it('never eases in and only keeps the spinner and shimmer keyframes', () => {
    for (const file of [...styles, TOKENS]) {
      const css = withoutComments(read(file));
      expect(css, file).not.toMatch(/ease-in\b/);
      expect([...css.matchAll(/@keyframes\s+([\w-]+)/g)].map(m => m[1]).filter(name => !['spin', 'shimmer'].includes(name)), file).toEqual([]);
    }
  });

  it('keeps layers on the one scale', () => {
    expect(hits(all.filter(d => d.prop === 'z-index' && !/^(var\(--z-[a-z-]+\)|auto|-1|[0-9])$/.test(d.value)))).toEqual([]);
  });

  it('uses logical properties so Arabic mirrors without overrides', () => {
    const physical = all.filter(d => /^(left|right|(margin|padding|border)-(left|right)(-[a-z]+)?|float)$/.test(d.prop) || (d.prop === 'text-align' && /^(left|right)$/.test(d.value)));
    expect(hits(physical)).toEqual([]);
  });

  it('keeps text, the primary button, the accent and every status chip at WCAG AA contrast in both themes', () => {
    const tokens = read(TOKENS);
    const block = (selector: string) => tokens.slice(tokens.indexOf(selector)).split('}')[0];
    const light = block(':root {'), dark = block("[data-theme='dark'] {");
    const value = (scope: string, name: string) => (scope.match(new RegExp(`--${name}: (#[0-9A-Fa-f]{6})`)) ?? light.match(new RegExp(`--${name}: (#[0-9A-Fa-f]{6})`)))![1];
    const luminance = (hex: string) => {
      const [r, g, b] = hex.slice(1).match(/../g)!.map(part => parseInt(part, 16) / 255).map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
    const pairs = [['text', 'bg'], ['text', 'surface'], ['text', 'surface-2'], ['text-2', 'bg'], ['text-2', 'surface'], ['text-2', 'surface-2'], ['ink-fg', 'ink'], ['ink-fg', 'ink-hover'], ['accent', 'surface'], ['accent', 'bg'], ['accent', 'accent-soft'], ['st-late', 'st-late-bg'], ['st-wait', 'st-wait-bg'], ['st-prog', 'st-prog-bg'], ['st-done', 'st-done-bg'], ['st-open', 'st-open-bg'], ['st-late', 'surface']];
    for (const [theme, scope] of [['light', light], ['dark', dark]] as const) for (const [fg, bg] of pairs) expect(contrast(value(scope, fg), value(scope, bg)), `${theme}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it('has no native select', () => {
    expect(code.filter(file => /<select\b/.test(read(file)))).toEqual([]);
  });

  it('allows inline style only for measured positions', () => {
    expect(code.filter(file => /style=\{\{/.test(read(file)) && !INLINE_STYLE_ALLOWED.has(file))).toEqual([]);
  });

  it('draws icons with lucide only', () => {
    expect(code.filter(file => /<svg\b/.test(read(file)) && !SVG_ALLOWED.has(file))).toEqual([]);
    expect(code.filter(file => /from ['"](react-icons|@heroicons|@tabler|@phosphor-icons)/.test(read(file)))).toEqual([]);
  });
});
