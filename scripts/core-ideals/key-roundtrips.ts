import assert from 'node:assert/strict';
import * as u from '../../src';
import {backend} from '../../native/postgresql/runtime';
import {tableSpecKeyProjectionCases} from './key-tablespec-projection-cases';
import {postgresqlKeyProjectionCases} from './key-postgresql-projection-cases';
import {sqlserverKeyProjectionCases} from './key-sqlserver-projection-cases';
import {avroKeyProjectionCases} from './key-avro-projection-cases';
import {parquetKeyProjectionCases} from './key-parquet-projection-cases';

type Binding = {rows: any[]; project: (row: any) => any; recover: (receipt: any, target: any) => any};
const bindings: Record<string, Binding> = {
 tablespec: {rows: tableSpecKeyProjectionCases(), project: r => u.projectKeysToTableSpec(r.source, r.authors, r.request), recover: u.recoverKeysTableSpecIdeal},
 postgresql: {rows: postgresqlKeyProjectionCases(), project: r => u.projectKeysToPostgresql(r.source, r.authors, r.request, backend), recover: (r, t) => u.recoverKeysPostgresqlIdeal(r, t, backend)},
 sqlserver: {rows: sqlserverKeyProjectionCases(), project: r => u.projectKeysToSqlServer(r.source, r.authors, r.request), recover: u.recoverKeysSqlServerIdeal},
 avro: {rows: avroKeyProjectionCases(), project: r => u.projectKeysToAvro(r.source, r.authors, r.request), recover: u.recoverKeysAvroIdeal},
 parquet: {rows: parquetKeyProjectionCases(), project: r => u.projectKeysToParquet(r.source, r.authors, r.request), recover: u.recoverKeysParquetIdeal},
};

/** Shared authored-recovery contract. Native reclassification and enforcement
 * evidence are separate obligations; this function does not grant admission. */
export async function verifyKeyAuthoredRoundTrips() {
 const coverage: Record<string, {cases: number; projected: number; blocked: number; recoveries: number; forgedRefusals: number; strictBlocks: number}> = {};
 for (const [system, binding] of Object.entries(bindings)) {
  const count = {cases: binding.rows.length, projected: 0, blocked: 0, recoveries: 0, forgedRefusals: 0, strictBlocks: 0};
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
   assert.ok(result.target);
   assert.equal(result.mappings.length, row.authors.length);
   assert.ok(result.mappings.length >= 2, `${system}: missing plural keys`);
   for (const mapping of result.mappings) {
    assert.ok(mapping.keyId && mapping.keyName);
    assert.ok(result.residuals.some((r: any) => r.path === mapping.idealPath), `${system}: missing per-key residual`);
   }
   for (const format of ['json', 'yaml'] as const) {
    const stored = u.readJsonValue(u.writeJsonValue(result, format), format) as any;
    assert.deepEqual(await binding.recover(stored, stored.target), row.source);
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
