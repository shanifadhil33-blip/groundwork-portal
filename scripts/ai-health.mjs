#!/usr/bin/env node
import { pathToFileURL } from 'node:url';

// One model per configured provider, sequentially, to conserve the free allowances.
// Dependencies are passed in so the command can be tested without sending real requests.
export async function runHealth({ list, probe, write = console.log }) {
  const seen = new Set();
  let failed = false;
  write('provider status ms');
  for (const provider of list) {
    const id = provider.name.split('/')[0];
    if (seen.has(id)) continue;
    seen.add(id);
    let status = 'error';
    let ms = 0;
    const start = Date.now();
    try {
      const result = await probe(provider);
      status = result.status === 'ok' ? 'ok' : Number.isInteger(result.code) && result.code > 0 ? `error(${result.code})` : 'error';
      ms = Math.max(0, Math.round(result.ms));
    } catch {
      ms = Date.now() - start;
    }
    failed ||= status !== 'ok';
    // Print only fixed provider identifiers, never model overrides, URLs, headers or error text.
    const safeId = /^(gemini|openrouter|cloudflare|kilo|ovh|zai|nvidia|requesty|groq|cerebras|mistral|github)$/.test(id) ? id : 'custom';
    write(`${safeId} ${status} ${Number.isFinite(ms) ? ms : 0}`);
  }
  return failed ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const { config } = await import('dotenv');
    config({ path: '.env.local', quiet: true });
    const { tsImport } = await import('tsx/esm/api');
    const { providers, probeProvider } = await tsImport('../lib/ai.ts', import.meta.url);
    process.exitCode = await runHealth({ list: providers(), probe: probeProvider });
  } catch {
    console.error('AI health could not start.');
    process.exitCode = 1;
  }
}
