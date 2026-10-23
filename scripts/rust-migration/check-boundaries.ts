// SPDX-License-Identifier: MIT OR Apache-2.0
// Use one supported interpreter for the live inventory and boundary controls.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root = resolve(fileURLToPath(import.meta.url), '../../..');
const candidates = [
  process.env.UMF_PYTHON,
  'python3.13',
  'python3.12',
  'python3.11',
  'python3',
  'python',
].filter((candidate): candidate is string => Boolean(candidate));
const python = candidates.find((candidate) =>
  spawnSync(candidate, ['-c', 'import sys; raise SystemExit(sys.version_info < (3, 11))'],
    {cwd: root, stdio: 'ignore'}).status === 0);
if (!python) {
  throw new Error('Rust migration boundary checks require Python 3.11 or newer');
}

const checks: [string, ...string[]][] = [
  ['scripts/rust-migration/r4/inventory/capture.py', '--live-check'],
  ['scripts/check-rust-boundaries.py'],
  ['tests/rust-inventory/test_boundaries.py'],
  ['tests/rust-inventory/test_inventory.py'],
];
for (const [script, ...args] of checks) {
  const result = spawnSync(python, [script, ...args], {cwd: root, stdio: 'inherit'});
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
