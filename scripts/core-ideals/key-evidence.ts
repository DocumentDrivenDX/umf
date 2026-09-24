import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {isAbsolute, relative, resolve} from 'node:path';

export const keySystems = ['tablespec', 'postgresql', 'sqlserver', 'avro', 'parquet'] as const;
export type KeyEvidenceReader = (path: string) => Promise<Uint8Array>;
const read: KeyEvidenceReader = async p => new Uint8Array(await Bun.file(p).arrayBuffer());
const file = (stem: string) => `fixtures/validation/${stem}.json`;
const digest = (data: Uint8Array) => createHash('sha256').update(data).digest('hex');
const browsers: Record<string, Record<string, number|boolean>> = {
 'tablespec-classification': {cases:16,recoveries:32,strictBlocks:14,forgedRefusals:16,staleRefusals:16,projected:12,projectionBlocks:16,idealRecoveries:24,nativeRecoveries:24},
 'postgresql-catalog': {indexes:17,recoveries:2,correlated:17,correlatedRecoveries:2,correlationRefusals:6,unknownTokensPreserved:true},
 postgresql: {observations:17,recoveries:2,strictBlocked:true,refusals:38,projected:17,projectionBlocks:3,idealRecoveries:34,nativeRecoveries:34},
 sqlserver: {observations:25,recoveries:2,refusals:8,strictBlocked:true,unknownTokensPreserved:true},
 'sqlserver-encoding': {observations:7,computedKeys:4,recoveries:2,distinctCoreExamples:19,invalidUnicodeRefused:true,forgedRefused:true},
 'sqlserver-projection': {projected:19,blocked:7,recoveries:38,refusals:38},
 avro: {cases:13,recoveries:26,refusals:13,strictBlocks:13},
 'avro-projection': {projected:16,blocked:4,recoveries:32,refusals:32},
 parquet: {classified:7,blocked:1,recoveries:14,blockedSourceRecoveries:2,refusals:7,strictBlocks:8},
 'parquet-projection': {projected:21,blocked:3,recoveries:42,refusals:42},
};
const commands = ['key-tablespec-oracle','key-postgresql-discovery','key-postgresql-oracle','key-sqlserver-discovery','key-sqlserver-encoding-discovery','key-sqlserver-oracle','key-avro-oracle','key-parquet-oracle','key-tablespec-browser','key-postgresql-catalog-browser','key-postgresql-browser','key-sqlserver-browser','key-sqlserver-encoding-browser','key-sqlserver-projection-browser','key-avro-browser','key-avro-projection-browser','key-parquet-browser','key-parquet-projection-browser'];

/** Checks current qualification evidence, not authentication or ideal admission.
 * Earlier binding acceptance records remain historical rather than being rehashed. */
export async function verifyKeyEvidence(reader: KeyEvidenceReader = read) {
 const contents = new Map<string, Uint8Array>();
 const pending: {path: string; record: any}[] = [];
 function safe(path: string) {
  assert.ok(typeof path === 'string' && path.length && !path.includes('\\'), `unsafe evidence path: ${path}`);
  const local = relative(process.cwd(), resolve(path));
  assert.ok(local && !isAbsolute(local) && !local.split('/').includes('..') && !path.split('/').includes('..'), `unsafe evidence path: ${path}`);
  return local;
 }
 async function bytes(path: string) {path = safe(path); if (!contents.has(path)) contents.set(path, await reader(path)); return contents.get(path)!;}
 async function load(path: string) {
  const record = JSON.parse(new TextDecoder().decode(await bytes(path)));
  assert.ok(record.sha256 && Object.keys(record.sha256).length, `${path}: missing fingerprints`);
  for (const [p, h] of Object.entries(record.sha256)) {safe(p); assert.match(String(h), /^[0-9a-f]{64}$/, 'invalid fingerprint');}
  pending.push({path, record}); return record;
 }
 const refreshPath = file('key-gate-refresh-evidence'), refresh = await load(refreshPath);
 assert.equal(refresh.complete, true, 'incomplete refresh');
 assert.equal(refresh.idealAdmitted, false, 'refresh cannot admit ideal');
 assert.equal(refresh.nativeEquivalence, false, 'unexpected equivalence claim');
 assert.deepEqual(refresh.runs.map((r: any) => r.command), [
  ['bun','run','typecheck'],['bun','run','build'],['bun','run','build:postgresql'],['bun','run','test:schemas'],
  ...commands.map(s => ['bun',`scripts/core-ideals/${s}.ts`]),
 ], 'incomplete command matrix');
 for (const run of refresh.runs) assert.equal(run.exitCode, 0, 'failed command');
 const records: {path:string; sha256:string}[] = [];
 async function proof(stem: string) {
  const path = file(stem); assert.ok(Object.hasOwn(refresh.sha256, path), `missing required proof: ${path}`);
  const record = await load(path); records.push({path, sha256: digest(await bytes(path))}); return record;
 }
 for (const system of keySystems) {
  for (const part of ['discovery','projection']) {
   const p = await proof(`key-${system}-${part}-native`);
   if (system === 'tablespec') assert.equal(p.nativeVersion, '647e8e566ad78b864282ec65c0b0b2237aa63084', 'incompatible TableSpec');
   if (system === 'postgresql') assert.equal(p.serverVersion, 170004, 'incompatible PostgreSQL');
   if (system === 'sqlserver') assert.equal(p.serverVersion, '16.0.4295.3', 'incompatible SQL Server');
   if (system === 'avro') assert.deepEqual(p.versions, {apache:'1.12.0',fastavro:'1.12.2'}, 'incompatible Avro');
   if (system === 'parquet') assert.equal(p.runtime, 'PyArrow 21.0.0', 'incompatible Parquet');
   assert.ok(Array.isArray(p[part === 'discovery' ? 'cases' : 'rows']) && p[part === 'discovery' ? 'cases' : 'rows'].length, 'empty native evidence');
   if (part === 'discovery' && (system === 'postgresql' || system === 'sqlserver')) {
    const expected = system === 'postgresql'
     ? {'primary-rejects-duplicate':'23505','alternate-rejects-duplicate':'23505','primary-rejects-null':'23502','alternate-rejects-null':'23502','partial-outside-predicate-duplicate':'00000','char-padding-collapses-distinct-ideal':'23505'}
     : {'primary-duplicate':2627,'alternate-duplicate':2627,'primary-null':515,'alternate-null':515,'partial-outside-second':0,'disabled-accepts-duplicate':0,'binary-collation-trailing-space':2627,'binary-trailing-zero':2627};
    for (const [id, value] of Object.entries(expected)) {
     const row = p.cases.find((r:any) => r.id === id); assert.ok(row, `missing native control: ${id}`);
     assert.equal(system === 'postgresql' ? row.sqlstate : row.actual.error, value, `failed native control: ${id}`);
    }
   }
   if (part === 'projection') {
    if (system === 'postgresql') {
     const projected = p.rows.filter((r:any) => r.status === 'projected'); assert.equal(projected.length, 17, 'incomplete PostgreSQL projection');
     for (const row of projected) {
      for (const [id, state] of [['positive-control','00000'],['duplicate-tuple','23505'],['required-first-component','23502']])
       assert.equal(row.probes.find((r:any) => r.id === id)?.sqlstate, state, `failed projection control: ${row.name}/${id}`);
      assert.ok(row.indexes.length >= 2);
      for (const index of row.indexes) {
       assert.equal(index.unique, true); assert.equal(index.predicate, null); assert.equal(index.immediate, true);
       assert.ok(index.components.every((c:any) => c.notNull));
      }
     }
    }
    if (system === 'sqlserver') {
     assert.equal(p.projected, 19); assert.equal(p.verifiedConstraints, 39);
     const names = [...new Set(p.rows.map((r:any) => r.case))]; assert.equal(names.length, 19);
     for (const name of names) for (const [id, code] of [['insert',0],['duplicate',2627],['required',515]])
      assert.equal(p.rows.find((r:any) => r.case === name && r.id === id)?.actual.error, code, `failed projection control: ${name}/${id}`);
    }
    if (system === 'tablespec') {
     assert.equal(p.rows.length, 12);
     for (const row of p.rows) {
      assert.equal(row.modelAccepted, true); assert.equal(row.schemaAccepted, true);
      assert.equal(row.duplicateRowsIndividuallyAccepted, true); assert.equal(row.enforcementEstablished, false);
     }
    }
    if (system === 'avro') {
     assert.equal(p.rows.length, 32);
     for (const row of p.rows) {
      assert.deepEqual(row.values[0], row.values[1], 'missing duplicate record control');
      for (const codec of ['apache','fastavro']) assert.deepEqual(row.reads[codec], row.values, 'native cross-read mismatch');
     }
    }
    if (system === 'parquet') {
     assert.equal(p.rows.length, 21);
     for (const row of p.rows) {
      assert.deepEqual(row.decoded[0], row.decoded[1], 'missing duplicate record control');
      assert.equal(row.requiredNullRefused, 'ArrowInvalid');
     }
    }
   }
  }
 }
 const encoding = await proof('key-sqlserver-encoding-native');
 assert.equal(encoding.serverVersion, '16.0.4295.3', 'incompatible encoding proof');
 for (const [name, expected] of Object.entries(browsers)) {
  const p = await proof(`key-${name}-browser`);
  assert.match(p.browser, /^148\./, 'incompatible browser');
  assert.deepEqual(p.externalRequests, [], 'external browser requests');
  for (const [key, value] of Object.entries(expected)) assert.equal(p.checks?.[key], value, `incomplete browser coverage: ${name}/${key}`);
 }
 let fingerprints = 0;
 // Structural checks precede hashes so malformed proofs have useful diagnostics.
 for (const {path, record} of pending) for (const [p, h] of Object.entries(record.sha256)) {
  assert.equal(digest(await bytes(p)), h, `${path}: stale ${p}`); fingerprints++;
 }
 return {systems:[...keySystems], records, fingerprints, refreshSha256:digest(await bytes(refreshPath)), idealAdmitted:false, nativeEquivalence:false};
}

if (import.meta.main) console.log(JSON.stringify(await verifyKeyEvidence()));
