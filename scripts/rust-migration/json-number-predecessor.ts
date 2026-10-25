import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {assertExactJsonNumber} from '../../src/model/internal/json-number';

const root = resolve(import.meta.dir, '../..');
const packetPath = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r8-json-number-predecessor/typescript-predecessor.json');
const sourcePaths = ['src/model/internal/json-number.ts', 'src/model/errors.ts'];
const cases = [
  ['zero', '0'], ['negative-zero', '-0'], ['integer', '42'], ['safe-integer-max', '9007199254740991'],
  ['unsafe-integer', '9007199254740992'], ['ordinary-fraction', '0.1'], ['rounded-fraction', '0.10000000000000001'],
  ['exponent-fraction', '1e-7'], ['equivalent-exponent', '100e-2'], ['large-exponent-overflow', '1e309'],
  ['small-exponent-underflow', '1e-324'], ['signed-mantissa', '+1'], ['leading-zero', '01'], ['empty', ''],
  ['whitespace', ' 1'], ['hex', '0x10'], ['nan', 'NaN'], ['infinity', 'Infinity'],
] as const;

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function capture() {
  const sources = await Promise.all(sourcePaths.map(async path => ({path, sha256: sha256(await readFile(resolve(root, path)))})));
  const outcomes = cases.map(([id, token]) => {
    try {
      assertExactJsonNumber(token);
      return {id, token, outcome: 'accepted'};
    } catch (error) {
      const e = error as {name?: string; message?: string; code?: string};
      return {id, token, outcome: 'refused', error: {name: e.name, code: e.code, message: e.message}};
    }
  });
  return {
    format: 'umf.r8.json-number-typescript-predecessor/1',
    runtime: {name: 'Bun', version: Bun.version},
    operation: 'assertExactJsonNumber',
    cases: outcomes,
    sources,
  };
}

const actual = await capture();
if (process.argv.includes('--print')) {
  console.log(JSON.stringify(actual, null, 2));
} else if (process.argv.includes('--check')) {
  const expected = JSON.parse(await readFile(packetPath, 'utf8'));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.error('TypeScript predecessor packet drifted; recapture only after reviewing the source change.');
    process.exitCode = 1;
  } else console.log(`PASS ${actual.operation}: ${actual.cases.length} frozen outcomes`);
} else {
  await writeFile(packetPath, `${JSON.stringify(actual, null, 2)}\n`);
  console.log(`Wrote ${packetPath}`);
}
