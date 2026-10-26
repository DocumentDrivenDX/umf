// Node 26 loader for direct TypeScript source imports with Bun-style extensionless paths.
import {access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
export async function resolve(specifier, context, nextResolve) {
  try { return await nextResolve(specifier, context); } catch (error) {
    if (!context.parentURL || !specifier.startsWith('.')) throw error;
    const url = new URL(specifier, context.parentURL);
    for (const suffix of ['.ts', '.js', '/index.ts', '/index.js']) {
      const candidate = new URL(url.href + suffix);
      try { await access(fileURLToPath(candidate)); return {url: candidate.href, shortCircuit: true}; } catch {}
    }
    throw error;
  }
}
