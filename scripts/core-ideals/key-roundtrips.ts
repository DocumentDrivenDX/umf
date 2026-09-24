import assert from 'node:assert/strict';
import * as u from '../../src';
import {backend} from '../../native/postgresql/runtime';
import {tableSpecKeyProjectionCases} from './key-tablespec-projection-cases';
import {postgresqlKeyProjectionCases} from './key-postgresql-projection-cases';
import {sqlserverKeyProjectionCases} from './key-sqlserver-projection-cases';
import {avroKeyProjectionCases} from './key-avro-projection-cases';
import {parquetKeyProjectionCases} from './key-parquet-projection-cases';

type Binding = {rows: any[]; project: (row: any) => any; recover: (receipt: any, target: any) => any; reimport:(receipt:any,row:any)=>any};
const bindings: Record<string, Binding> = {
 tablespec: {rows: tableSpecKeyProjectionCases(), project: r => u.projectKeysToTableSpec(r.source, r.authors, r.request), recover: u.recoverKeysTableSpecIdeal, reimport:(r,c)=>u.importTableSpec(u.exportTableSpec(r.target),{id:c.request.id,format:'json'})},
 postgresql: {rows: postgresqlKeyProjectionCases(), project: r => u.projectKeysToPostgresql(r.source, r.authors, r.request, backend), recover: (r, t) => u.recoverKeysPostgresqlIdeal(r, t, backend), reimport:(r,c)=>u.importPostgresqlSql(r.nativeSql,backend,{id:c.request.id})},
 sqlserver: {rows: sqlserverKeyProjectionCases(), project: r => u.projectKeysToSqlServer(r.source, r.authors, r.request), recover: u.recoverKeysSqlServerIdeal, reimport:r=>({format:'sqlserver-ddl',sql:r.nativeSql})},
 avro: {rows: avroKeyProjectionCases(), project: r => u.projectKeysToAvro(r.source, r.authors, r.request), recover: u.recoverKeysAvroIdeal, reimport:(r,c)=>u.importAvroSchema(u.exportAvroSchema(r.target),{id:c.request.id})},
 parquet: {rows: parquetKeyProjectionCases(), project: r => u.projectKeysToParquet(r.source, r.authors, r.request), recover: u.recoverKeysParquetIdeal, reimport:(r,c)=>u.importParquetSchema(u.exportParquetCapture(r.target),{id:c.request.id})},
};

/** Shared authored-recovery contract. Native reclassification and enforcement
 * evidence are separate obligations; this function does not grant admission. */
export async function verifyKeyAuthoredRoundTrips() {
 const coverage: Record<string, {cases: number; projected: number; blocked: number; recoveries: number; forgedRefusals: number; strictBlocks: number; usefulStoredValueMappings: number}> = {};
 for (const [system, binding] of Object.entries(bindings)) {
  const count = {cases: binding.rows.length, projected: 0, blocked: 0, recoveries: 0, forgedRefusals: 0, strictBlocks: 0, usefulStoredValueMappings: 0};
  for (const row of binding.rows) {
   const before = structuredClone(row), result = await binding.project(row);
   assert.deepEqual(row, before, `${system}/${row.name}: mutated author input`);
   assert.equal(result.status, row.expected, `${system}/${row.name}`);
   assert.ok(Array.isArray(result.residuals));
   for (const residual of result.residuals) {
    assert.ok(residual.path.startsWith('/'));
    assert.ok(residual.reason && residual.recovery);
    assert.notEqual(residual.outcome, 'exact');
   }
   if (result.status === 'blocked') {
    assert.equal(result.target, undefined); assert.ok(result.residuals.length); count.blocked++; continue;
   }
   count.projected++;
   if (['postgresql','sqlserver'].includes(system) && result.mappings.length && result.mappings.every((m:any)=>m.equality==='exact-on-representable-values' && ['primary-key-not-null','unique-not-null'].includes(m.enforcement))) count.usefulStoredValueMappings++;
   assert.ok(result.target);
   // SQL Server consumes explicit DDL text; its independent native catalog
   // classification is exercised separately, without claiming a DDL parser.
   const imported=await binding.reimport(result,row);
   assert.equal(result.mappings.length, row.authors.length);
   assert.ok(result.mappings.length >= 2, `${system}: missing plural keys`);
   for (const mapping of result.mappings) {
    assert.ok(mapping.keyId && mapping.keyName);
    assert.ok(result.residuals.some((r: any) => r.path === mapping.idealPath), `${system}: missing per-key residual`);
   }
   for (const format of ['json', 'yaml'] as const) {
    const stored = u.readJsonValue(u.writeJsonValue(result, format), format) as any;
    assert.deepEqual(await binding.recover(stored, imported), row.source);
    count.recoveries++;
    const forged = structuredClone(stored); forged.mappings[0].keyId = 'forged';
    await assert.rejects(async () => binding.recover(forged, stored.target)); count.forgedRefusals++;
   }
   const strict = await binding.project({...row, request: {...row.request, mode: 'strict'}});
   if (result.residuals.length) {
    assert.equal(strict.status, 'blocked'); assert.equal(strict.target, undefined); count.strictBlocks++;
   }
  }
  assert.ok(count.projected && count.blocked && count.strictBlocks, `${system}: vacuous matrix`);
  coverage[system] = count;
 }
 return coverage;
}

export async function verifyKeyIdentityConflicts() {
 const coverage: Record<string, number> = {};
 for (const [system, binding] of Object.entries(bindings)) {
  const base=binding.rows.find(r=>r.name==='primary-report'),compound=binding.rows.find(r=>r.name==='compound-ordered');
  assert.ok(base && compound, `${system}: missing identity controls`);
  const cross=structuredClone(base),changed=structuredClone(base),reordered=structuredClone(compound),missing=structuredClone(base);
  cross.source.modules[0].elements.push({id:'other-owner',kind:'record',members:[cross.request.columns[0].field],extensions:{}});
  changed.source.modules[0].elements[0].keys[0].id='different-key';
  reordered.source.modules[0].elements[0].keys[0].fields.reverse();
  delete missing.source.modules[0].elements[0].members;
  for(const row of [cross,changed,reordered,missing]) await assert.rejects(async()=>binding.project(row), `${system}: accepted conflicting identity`);
  coverage[system]=4;
 }
 return coverage;
}
