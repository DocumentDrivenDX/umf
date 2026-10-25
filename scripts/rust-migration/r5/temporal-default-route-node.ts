import {resolve} from 'node:path';

const entry = process.env.UMF_TEMPORAL_DEFAULT_NODE;
if (!entry) throw new Error('Set UMF_TEMPORAL_DEFAULT_NODE to the source-built dist/umf-node.js');
const [actual, dates, instants] = await Promise.all([
  import(resolve(entry)),
  import(new URL('../../../src/adapters/gregorian-date.ts', import.meta.url).href),
  import(new URL('../../../src/adapters/rfc3339-exact-instant.ts', import.meta.url).href),
]);
const checks: Array<[string, () => unknown, () => unknown]> = [
  ['date type', () => actual.parseGregorianDate(null), () => dates.parseGregorianDate(null)],
  ['date length', () => actual.parseGregorianDate('2026-1-01'), () => dates.parseGregorianDate('2026-1-01')],
  ['date syntax', () => actual.parseGregorianDate('2026/01/01'), () => dates.parseGregorianDate('2026/01/01')],
  ['date calendar', () => actual.parseGregorianDate('2026-02-30'), () => dates.parseGregorianDate('2026-02-30')],
  ['truncate date before unit', () => actual.truncateGregorianDate('2026-02-30', {}), () => dates.truncateGregorianDate('2026-02-30', {})],
  ['instant type', () => actual.parseRfc3339ExactInstant(null), () => instants.parseRfc3339ExactInstant(null)],
  ['instant syntax', () => actual.parseRfc3339ExactInstant('bad'), () => instants.parseRfc3339ExactInstant('bad')],
  ['equality left before right', () => actual.sameRfc3339ExactInstant('bad', {}), () => instants.sameRfc3339ExactInstant('bad', {})],
];
const rawValues = [undefined, null, 0, true, {}, Object.create(null), new String('2026-01-01'), new Date(0), new Proxy({}, {get() { throw new Error('trap ran'); }}), (() => { const revocable = Proxy.revocable({}, {}); revocable.revoke(); return revocable.proxy; })()];
for (const [index, value] of rawValues.entries()) {
  checks.push([`raw host ${index}`, () => actual.parseGregorianDate(value), () => dates.parseGregorianDate(value)]);
}
const shape = (value: unknown) => value instanceof Error ? `${value.constructor.name}:${value.message}` : JSON.stringify(value);
for (const [label, rust, typescript] of checks) {
  let left: unknown;
  let right: unknown;
  try { left = rust(); } catch (error) { left = error; }
  try { right = typescript(); } catch (error) { right = error; }
  if (shape(left) !== shape(right)) throw new Error(`${label}: default/native=${shape(left)} TS=${shape(right)}`);
}
for (const [label, rust, typescript] of [
  ['truncate date before hostile unit', () => actual.truncateGregorianDate('bad', new Proxy({}, {get() { throw new Error('unit trap'); }})), () => dates.truncateGregorianDate('bad', new Proxy({}, {get() { throw new Error('unit trap'); }}))],
  ['equality left before hostile right', () => actual.sameRfc3339ExactInstant('bad', new Proxy({}, {get() { throw new Error('right trap'); }})), () => instants.sameRfc3339ExactInstant('bad', new Proxy({}, {get() { throw new Error('right trap'); }}))],
] as const) {
  const capture = (run: () => unknown) => { try { return `return:${JSON.stringify(run())}`; } catch (error) { return `${(error as Error).constructor.name}:${(error as Error).message}`; } };
  if (capture(rust) !== capture(typescript)) throw new Error(`${label}: ${capture(rust)} != ${capture(typescript)}`);
}
console.log(JSON.stringify({status: 'pass', runtime: process.version, exactClassMessageAndRawHostParity: true, leftFirstRefusalParity: true}));
