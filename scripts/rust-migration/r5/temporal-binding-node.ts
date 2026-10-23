import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

const packageEntry = process.env.UMF_R5_NODE_PACKAGE;
if (!packageEntry) throw new Error('Set UMF_R5_NODE_PACKAGE to the staged Node package index.js');
type FixtureRow = {kind: 'date'; token: string; year: number; month: number; day: number; yearStart: string; quarterStart: string; monthStart: string}
  | {kind: 'instant'; token: string; utcSeconds: string; fractionalDigits: string; originalOffset: string; localOffsetKnown: boolean};
const [nativePackage, gregorianModule, instantModule, rows] = await Promise.all([
  import(resolve(packageEntry)),
  import(new URL('../../../src/adapters/gregorian-date.ts', import.meta.url).href),
  import(new URL('../../../src/adapters/rfc3339-exact-instant.ts', import.meta.url).href),
  readFile(process.env.UMF_R5_FIXTURE ?? '/private/tmp/umf-r5-temporal/fixture.json', 'utf8').then((text) => JSON.parse(text) as FixtureRow[]),
]);
const {createTemporalEngine} = nativePackage;
const {parseGregorianDate, truncateGregorianDate} = gregorianModule;
const {parseRfc3339ExactInstant, sameRfc3339ExactInstant} = instantModule;
const engine = createTemporalEngine();
for (const row of rows) {
  if (row.kind === 'date') {
    const actual = engine.parseGregorianDate(row.token);
    const expected = parseGregorianDate(row.token);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`TS/native Gregorian parse differs: ${row.token}`);
    for (const unit of ['year', 'quarter', 'month'] as const) {
      if (engine.truncateGregorianDate(row.token, unit) !== truncateGregorianDate(row.token, unit) || engine.truncateGregorianDate(row.token, unit) !== row[`${unit}Start`]) throw new Error(`Gregorian truncation differs: ${row.token}/${unit}`);
    }
  } else {
    const actual = engine.parseRfc3339ExactInstant(row.token);
    const expected = parseRfc3339ExactInstant(row.token);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`TS/native instant parse differs: ${row.token}`);
  }
}
if (!Object.isFrozen(engine) || rows.some((row) => !Object.isFrozen(row.kind === 'date' ? engine.parseGregorianDate(row.token) : engine.parseRfc3339ExactInstant(row.token)))) throw new Error('Temporal objects must be frozen');
if (engine.parseRfc3339ExactInstant('2024-01-01T00:00:00-00:00').originalOffset !== '-00:00' || engine.parseRfc3339ExactInstant('2024-01-01T00:00:00-00:00').localOffsetKnown !== false) throw new Error('Unknown local offset was lost');
if (!engine.sameRfc3339ExactInstant('2000-01-01T00:00:00Z', '2000-01-01T01:00:00+01:00') || sameRfc3339ExactInstant('2000-01-01T00:00:00Z', '2000-01-01T01:00:00+01:00') !== true) throw new Error('Instant equality differs');
for (const [run, kind] of [[() => engine.parseGregorianDate(1), TypeError], [() => engine.parseGregorianDate('bad'), RangeError], [() => engine.parseRfc3339ExactInstant(null), TypeError], [() => engine.parseRfc3339ExactInstant('bad'), RangeError]] as const) {
  try { run(); throw new Error('Invalid token accepted'); } catch (error) { if (!(error instanceof kind)) throw error; }
}
console.log(JSON.stringify({status: 'pass', runtime: process.version, fixtureRows: rows.length, tsDifferential: true, frozen: true, unknownOffsetPreserved: true}));
