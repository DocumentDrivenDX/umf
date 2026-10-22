// SPDX-License-Identifier: MIT OR Apache-2.0
// Capture the existing 139 current-core controls as an R2-owned immutable input.
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const root = resolve(import.meta.dir, '../..');
const sourcePath = resolve(root, 'fixtures/metamodel/current-conformance.json');
const sourceReceiptPath = resolve(root, 'docs/helix/04-build/evidence/metamodel-authority/baseline-current/receipt.json');
const evidence = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r2');
const baseline = resolve(evidence, 'baseline-current-conformance.json');
const receipt = resolve(evidence, 'baseline-receipt.json');
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

const source = await readFile(sourcePath);
const parsed = JSON.parse(source.toString('utf8'));
const ids = parsed.cases?.map((item: {id?: string}) => item.id);
if (parsed.profile !== 'umf.current-conformance/1' || parsed.currentVersion !== '0.10.0'
  || ids?.length !== 139 || new Set(ids).size !== ids.length || ids.some((id: unknown) => typeof id !== 'string' || !id)) {
  throw new Error('R2 baseline source must be the frozen 139-case current-core corpus');
}
const sourceReceipt = JSON.parse((await readFile(sourceReceiptPath)).toString('utf8'));
if (sourceReceipt.caseCount !== 139 || sourceReceipt.status !== 'frozen-current-composite-observations') {
  throw new Error('R2 baseline source receipt no longer identifies the expected historical current-core capture');
}

await mkdir(evidence, {recursive: true});
const expectedReceipt = {
  id: 'umf.rust-migration.r2.baseline-current-conformance',
  status: 'frozen-input',
  capturedFrom: 'fixtures/metamodel/current-conformance.json',
  sourceReceipt: 'docs/helix/04-build/evidence/metamodel-authority/baseline-current/receipt.json',
  sourceReceiptSha256: sha256(await readFile(sourceReceiptPath)),
  sourceSha256: sha256(source),
  cases: ids.length,
  valid: parsed.cases.filter((item: {valid: boolean}) => item.valid).length,
  invalid: parsed.cases.filter((item: {valid: boolean}) => !item.valid).length,
  orderedDiagnostics: true,
  note: 'Copies the existing frozen current TypeScript observations for R2 comparison; this receipt is not a Rust result or qualification.',
};
const outputs = [[baseline, source], [receipt, Buffer.from(`${JSON.stringify(expectedReceipt, null, 2)}\n`)]] as const;
for (const [path, bytes] of outputs) {
  try {
    const existing = await readFile(path);
    if (!existing.equals(bytes)) throw new Error(`Frozen R2 baseline changed: ${path}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await writeFile(path, bytes, {flag: 'wx'});
  }
}
console.log(JSON.stringify({result: 'pass', baseline: 'docs/helix/04-build/evidence/rust-migration/r2/baseline-current-conformance.json', ...expectedReceipt}, null, 2));
