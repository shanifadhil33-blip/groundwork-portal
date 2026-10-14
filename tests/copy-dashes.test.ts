import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

// Next ships the Babel parser; TypeScript 7 no longer exposes the old compiler API.
const { parse } = createRequire(import.meta.url)('next/dist/compiled/babel/parser');
const root = fileURLToPath(new URL('../', import.meta.url));
type Node = { type: string; value?: any; name?: any; loc?: { start: { line: number } }; [key: string]: any };

// These attributes carry identifiers, CSS or navigation data, rather than copy.
const technicalAttributes = new Set([
  'className', 'style', 'href', 'src', 'srcSet', 'sizes', 'media', 'id', 'htmlFor',
  'key', 'name', 'value', 'dateTime', 'form', 'persistenceKey', 'describedBy', 'autoComplete',
  'aria-describedby', 'aria-labelledby', 'aria-controls', 'aria-activedescendant',
]);
const technicalValues = new Set(['mistral-medium-latest', 'mistral-small-latest', 
  'x-whatsapp-secret', 'latin-ext', 'content-length', 'not-allowed', 'service-not-allowed', 'Idempotency-Key', 'Set-Cookie', 'WWW-Authenticate', 'Content-Type', 'content-type',
  'Content-Disposition', 'If-Match', 'no-store', 'multipart/form-data',
  'sample-work-orders.csv', 'agent-access', 'data-label', 'aria-hidden',
  'x-vercel-forwarded-for', 'device-width', 'date-time', 'openai/gpt-oss-120b',
  'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite',
  'private, max-age=86400', 'private, no-store', "default-src 'none'", 'from-image', 'data-no-translate',
]);
const technicalProperties = new Set(['variable', 'powerPreference', 'cache', 'fontFamily']);
const domMethods = new Set([
  'getElementById', 'querySelector', 'querySelectorAll', 'closest', 'matches',
  'setProperty', 'setAttribute', 'supports',
]);

function technical(node: Node, ancestors: Node[]) {
  if (ancestors.some(parent => ['ImportDeclaration', 'ExportAllDeclaration', 'TSLiteralType', 'TSPropertySignature'].includes(parent.type))) return true;
  if (ancestors.some(parent => parent.type === 'ExportNamedDeclaration' && parent.source === node)) return true;
  if (ancestors.some(parent => parent.type === 'JSXAttribute' &&
    (technicalAttributes.has(parent.name.name) || parent.name.name.startsWith('data-')))) return true;
  if (ancestors.some(parent => parent.type === 'ObjectProperty' &&
    (parent.key === node || technicalProperties.has(parent.key.name)))) return true;
  return ancestors.some(parent => {
    if (!['CallExpression', 'OptionalCallExpression'].includes(parent.type)) return false;
    const callee = parent.callee;
    const method = callee?.property?.name;
    const object = callee?.object;
    return callee?.name === 'matchMedia' || domMethods.has(method) ||
      (['localStorage', 'sessionStorage'].includes(object?.name) && parent.arguments[0] === node) ||
      object?.property?.name === 'classList';
  });
}

function allowedData(text: string) {
  if (/^[a-z]{2,3}-[A-Z]{2}$/.test(text)) return true;
  // Preserve routes/URLs, cookie syntax, CSS values and identifier namespaces.
  return technicalValues.has(text) || /^(?:\.?\.?\/|https?:\/\/|\]\(\/)/.test(text) ||
    /^(?:var\(--|--[a-z]|\([a-z-]+:)/.test(text) ||
    /^(?:groundwork-|lx-|demo-ip:|first-use:|work-order-draft:|comment-visibility:)[\w:=-]*$/.test(text) ||
    /^(?:COBALT-DEMO-\d*|demo-(?:ordered|shipped|delivered)-\d*)$/.test(text) ||
    /^groundwork-(?:demo|session)=.*; Path=\/; SameSite=Lax; Max-Age=\d+$/.test(text) ||
    // AI model identifiers (provider/model-version, optional :free; SambaNova uses capitals, Cloudflare @cf/vendor/model).
    /^(?=[^ ]*\d)(?:@?[a-z0-9-]+\/)*[A-Za-z0-9.]+(?:-[A-Za-z0-9.]+)+(?::free)?$/.test(text) ||
    /^; Path=\/api\/demo; HttpOnly; SameSite=Lax; Max-Age=\d+$/.test(text) ||
    /^=?;?\s*Path=\/; SameSite=/.test(text) ||
    /^attachment; filename="import-errors\.csv"$/.test(text) ||
    /^try\{var t=localStorage\.getItem\('groundwork-theme'\)/.test(text);
}

function violations(source: string, file: string) {
  const ast = parse(source, { sourceType: 'module', plugins: ['typescript', 'jsx'] });
  const found: string[] = [];
  function visit(node: Node, ancestors: Node[] = []) {
    if (['StringLiteral', 'TemplateElement', 'JSXText'].includes(node.type) && !technical(node, ancestors)) {
      const text: string = node.type === 'TemplateElement' ? node.value.cooked ?? node.value.raw : node.value;
      // UUIDs, ISO dates and product numbers are data, including interpolated WO numbers.
      const copy = text.replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi, '')
        .replace(/\b\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))?/g, '')
        .replace(/\bWO-(?:\d+|N)\b|\bWO-$/g, '');
      // The suffix is compared against old demo records and never rendered.
      const legacySuffix = file === 'lib/ui/work-orders.ts' && node.type === 'TemplateElement' &&
        ancestors.some(parent => parent.type === 'VariableDeclarator' && parent.id.name === 'suffix');
      if (!legacySuffix && !allowedData(text) && /[—–]|\p{L}-\p{L}/u.test(copy)) {
        found.push(`${file}:${node.loc!.start.line}: ${JSON.stringify(text)}`);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (['loc', 'comments', 'leadingComments', 'trailingComments', 'innerComments', 'tokens'].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(child => { if (child?.type) visit(child, [...ancestors, node]); });
      else if (value?.type) visit(value, [...ancestors, node]);
    }
  }
  visit(ast.program);
  return found;
}

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

it('keeps visible copy, metadata, accessible labels and service messages free of dashes', () => {
  const paths = ['app', 'components', 'lib/ui', 'lib/services', 'lib/agent', 'lib/import']
    .flatMap(directory => files(join(root, directory)));
  paths.push(join(root, 'lib/ai.ts'), join(root, 'lib/fixture.ts'));
  const found = paths.flatMap(path => violations(readFileSync(path, 'utf8'), relative(root, path)));
  expect(found, found.join('\n')).toEqual([]);
});

it('detects JSX, string and template copy while allowing technical data and comments', () => {
  const source = `
    // A read-only implementation comment is not copy.
    const example = 'WO-55 on 2026-11-20';
    const label = 'Read-only';
    const reply = \`Ready — \${example}\`;
    const page = <p className="read-only" title="Client-visible" aria-label="A–Z">Sign-in <b>—</b></p>;
    const route = '/sign-in';
  `;
  expect(violations(source, 'example.tsx')).toHaveLength(6);
  expect(violations(`const label = 'WO-55 on 2026-11-20'; const x = <p>View only</p>;`, 'example.tsx')).toEqual([]);
});


it('keeps the sample CSV copy free of dashes while retaining ISO dates and sample references', () => {
  const sample = readFileSync(join(root, 'data/sample-work-orders.csv'), 'utf8')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '')
    .replace(/\bSAMPLE-\d+\b/g, '');
  expect(sample).not.toMatch(/[—–]|\p{L}-\p{L}/u);
});
import { describe as d2, it as i2, expect as e2 } from 'vitest';
d2('words', () => { i2('never says boss; the role is admin', () => { e2(['app','components','lib'].flatMap(dir=>files(join(root,dir))).filter(file=>/boss/i.test(readFileSync(file,'utf8')))).toEqual([]); }); });

it('allows Agent in user facing copy',()=>{expect(violations('<><h2>Agent</h2><input placeholder="Ask Agent or speak"/></>','example.tsx')).toEqual([]);});
