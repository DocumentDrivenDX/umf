// SPDX-License-Identifier: MIT OR Apache-2.0
// Run the direct TypeScript warning oracle in a fresh Bun realm so its
// synthetic policy cannot mutate the parent test/browser-runner process.
import {resolve} from 'node:path';

export async function directTypescriptWarningSelection() {
  const root = resolve(import.meta.dirname, '../../..');
  const child = Bun.spawn([process.execPath, resolve(root, 'scripts/rust-migration/r8/selection-private-host-direct-child.mjs')], {
    cwd: root, stdout: 'pipe', stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()]);
  const code = await child.exited;
  if (code !== 0) throw new Error(`direct TypeScript warning oracle failed (${code})\n${stderr}`);
  return JSON.parse(stdout);
}
