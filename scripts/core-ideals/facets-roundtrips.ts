import assert from 'node:assert/strict';
import * as u from '../../src';
import {backend} from '../../native/postgresql/runtime';
import {facetSystems, type FacetSystem} from './facets-evidence';
import {facetsTableSpecProjectionCases} from './facets-tablespec-projection-cases';
import {tableSpecFacetSource} from './facets-tablespec-cases';
import {facetsPostgresqlProjectionCases} from './facets-postgresql-projection-cases';
import {facetsSqlServerProjectionCases} from './facets-sqlserver-projection-cases';
import {facetsAvroProjectionCases} from './facets-avro-projection-cases';
import {avroFacetCase} from './facets-avro-cases';
import {parquetFacetProjectionCases} from './facets-parquet-projection-cases';

const upgrade = (d: u.Document) => u.upgradeFacetEnvelope(u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(u.upgradeFieldEnvelope(d).target).target).target).target;
const serialized = (r: any, format: 'json'|'yaml') => u.readJsonValue(u.writeJsonValue(u.copyJson(r), format), format) as any;
type Row = {author: u.CoreFacetDeclaration|u.CoreKindDeclaration; request: any; name?: string; id?: string};
type Classified = {source: u.Document; classify: (mode: 'strict'|'report') => any; recover: (r: any) => any; native: unknown};
type Binding = {rows: Row[]; project: (r: Row) => any; recover: (r: any) => any; classify: (r: any, row: Row, index: number) => Classified|Promise<Classified>};
const unknown = (d: u.Document) => {
 d.vocabularies.future = {version: '1.0.0'};
 d.extensions = {...d.extensions, future: {uninterpreted: ['9007199254740993', null]}};
 return d;
};
function resultContract(r: any, mode: 'strict'|'report') {
 assert.ok(Array.isArray(r.residuals));
 for (const loss of r.residuals) {
  assert.equal(typeof loss.path, 'string'); assert.ok(loss.path.startsWith('/'));
  assert.ok(loss.reason && loss.recovery); assert.notEqual(loss.outcome, 'exact');
 }
 if (r.status === 'blocked') {
  assert.equal(r.target, undefined); assert.ok(r.residuals.length);
 } else {
  assert.ok(r.target);
  if (mode === 'strict') assert.equal(r.residuals.length, 0);
 }
}

/** Replays every authored matrix and composes emitted targets with classification.
 * SQL classification uses independently captured native catalogs; it does not
 * infer engine acceptance by parsing our own emitted SQL.
 */
export async function verifyFacetRoundTrips(progress: (system: FacetSystem, index: number) => void = () => {}) {
 const pg = await Bun.file('fixtures/validation/facets-postgresql-projection-native.json').json();
 const sql = await Bun.file('fixtures/validation/facets-sqlserver-projection-native.json').json();
 const sqlCapture = JSON.parse(sql.sourceText);
 const pgNative = JSON.stringify(pg.capture), pgSupplement = JSON.stringify(pg.supplement);
 const pgSource = upgrade(u.importPostgresqlCatalogCapture(pgNative, {id: 'facet-gate'}));
 for (const e of pgSource.modules.find(m => m.id === 'postgresql.columns')!.elements) e.kind = 'field';
 unknown(pgSource);
 const pgColumns = u.getPostgresqlColumnMetadata(pgSource);
 const bindings: Record<FacetSystem, Binding> = {
  tablespec: {
   rows: facetsTableSpecProjectionCases(), project: r => u.projectFacetsToTableSpec(r.author, r.request),
   recover: r => u.recoverFacetsFromTableSpec(r, u.exportTableSpec(r.target)),
   classify: (r, row) => {
    const text = u.exportTableSpec(r.target), source = unknown(tableSpecFacetSource(text));
    return {source, native: text, classify: mode => u.classifyTableSpecFacets(source, {column: 0, profile: row.request.profile, input: row.request.input, obligation: row.request.obligation, mode}), recover: c => u.recoverTableSpecFacetSource(c, c.target)};
   },
  },
  postgresql: {
   rows: facetsPostgresqlProjectionCases(), project: r => u.projectFacetsToPostgresql(r.author, r.request, backend),
   recover: r => u.recoverFacetsFromPostgresql(r, r.nativeSql, backend),
   classify: (r, row) => {
    const native = pg.projections.find((p: any) => p.request.tableName === row.request.tableName);
    assert.equal(r.nativeSql, native.nativeSql);
    const relation = pg.capture.snapshot.relations.find((c: any) => c.name === row.request.tableName && c.schema === row.request.namespace); assert.ok(relation);
    // Retain every property of this relation and every other capture member.
    // Only the relation list and its CHECK supplement are explicitly selected.
    const nativeSource = JSON.stringify({...pg.capture, snapshot: {...pg.capture.snapshot, relations: [relation]}});
    const supplement = JSON.stringify({...pg.supplement, constraints: pg.supplement.constraints.filter((c: any) => c.relation === relation.name && c.schema === relation.schema)});
    const source = unknown(upgrade(u.importPostgresqlCatalogCapture(nativeSource, {id: 'facet-gate-relation'})));
    for (const e of source.modules.find(m => m.id === 'postgresql.columns')!.elements) e.kind = 'field';
    const column = u.getPostgresqlColumnMetadata(source)[0]!;
    return {source, native: {nativeSource, supplement}, classify: mode => u.classifyPostgresqlFacets(source, {column: column.path, nativeSource, supplement, mode, profile: 'stored-value', datumFormat: 'little-endian-datum64', obligation: row.request.obligation}, backend), recover: c => u.recoverPostgresqlFacetSource(c, c.target, backend)};
   },
  },
  sqlserver: {
   rows: facetsSqlServerProjectionCases(), project: r => u.projectFacetsToSqlServer(r.author, r.request),
   recover: r => u.recoverFacetsFromSqlServer(r, r.nativeSql),
   classify: (r, row, index) => {
    assert.equal(r.nativeSql, sql.cases[index].nativeSql);
    const table = sqlCapture.tables.find((t: any) => t.name === row.request.tableName && t.schema === row.request.namespace); assert.ok(table);
    const nativeSource = JSON.stringify({...sqlCapture, tables: [table]}, null, 2) + '\n';
    const source = unknown(upgrade(u.importSqlServerCatalog(nativeSource, {id: 'facet-gate'})));
    const column = u.getSqlServerColumnMetadata(source)[0]!, identity = {module: 'logical', element: 'value'};
    source.modules.push({id: 'logical', namespace: '', elements: [{id: 'value', kind: 'field', cardinality: 'one', name: column.element.name!, ...(column.element.scalarType ? {scalarType: column.element.scalarType} : {}), extensions: {}}]});
    return {source, native: nativeSource, classify: mode => u.classifySqlServerFacets(source, {column: column.path, nativeSource, identity, mode, profile: 'stored-value', obligation: row.request.obligation}), recover: c => u.recoverSqlServerFacetSource(c, c.target)};
   },
  },
  avro: {
   rows: [...facetsAvroProjectionCases(), ...facetsAvroProjectionCases().filter(r => r.request.nativeType === 'float').map(r => ({...r, id: r.id + '-exact-input', request: {...r.request, obligation: 'exact-input' as const}}))], project: r => u.projectFacetsToAvro(r.author, r.request),
   recover: r => u.recoverFacetsFromAvro(r, r.nativeSchema),
   classify: (r, row) => {
    const family = row.author.target.modules[0]!.elements[0]!.scalarType as u.ScalarType;
    const c = avroFacetCase(r.nativeSchema, family, {location: {path: '/fields/0/type'}, profile: row.request.profile, obligation: row.request.obligation});
    unknown(c.document);
    return {source: c.document, native: {schema: r.nativeSchema, dependencies: []}, classify: mode => u.classifyAvroFacets(c.document, {...c.request, mode}), recover: c => u.recoverAvroFacetSource(c, c.target)};
   },
  },
  parquet: {
   rows: parquetFacetProjectionCases(), project: r => u.projectFacetsToParquet(r.author, r.request),
   recover: r => u.recoverFacetsFromParquet(r, u.exportParquetCapture(r.target)),
   classify: (r, row) => {
    const bytes = u.exportParquetCapture(r.target), source = unknown(upgrade(u.importParquetSchema(bytes, {id: 'facet-gate'})));
    const family = row.author.target.modules[0]!.elements[0]!.scalarType as u.ScalarType;
    source.modules.push({id: 'logical', namespace: '', elements: [{id: 'value', kind: 'field', cardinality: 'one', scalarType: family, extensions: {}}]});
    return {source, native: bytes, classify: mode => u.classifyParquetFacets(source, {location: {index: 1, scope: 'present-non-null-leaf'}, identity: {module: 'logical', element: 'value'}, mode, profile: 'declared-schema', obligation: row.request.obligation}), recover: c => u.recoverParquetFacetSource(c, c.target)};
   },
  },
 };
 const coverage = {} as Record<FacetSystem, {authoredCases: number; projected: number; strictBlocks: number; reportBlocks: number; reportResiduals: number; idealRecoveries: number; nativeRecoveries: number; classificationBlocks: number; nonemptyMatches: number; usefulExactMappings: number; residualComparisons: number; facetlessControls: number; floatNarrowing: number; fullCatalogNativeRecoveries: number; aggregateSerializationRefusals: number}>;
 for (const system of facetSystems) {
  const b = bindings[system], count = {authoredCases: 0, projected: 0, strictBlocks: 0, reportBlocks: 0, reportResiduals: 0, idealRecoveries: 0, nativeRecoveries: 0, classificationBlocks: 0, nonemptyMatches: 0, usefulExactMappings: 0, residualComparisons: 0, facetlessControls: 0, floatNarrowing: 0, fullCatalogNativeRecoveries: 0, aggregateSerializationRefusals: 0};
  coverage[system] = count;
  if (system === 'postgresql') {
   const c = await u.classifyPostgresqlFacets(pgSource, {column: pgColumns[0]!.path, nativeSource: pgNative, supplement: pgSupplement, mode: 'report', profile: 'stored-value', datumFormat: 'little-endian-datum64', obligation: 'value-domain'}, backend);
   assert.equal(c.status, 'classified');
   assert.deepEqual(await u.recoverPostgresqlFacetSource(c, c.target!, backend), {nativeSource: pgNative, supplement: pgSupplement}); count.fullCatalogNativeRecoveries++;
   for (const format of ['json', 'yaml'] as const) {
    try { serialized(c, format); } catch (error) { assert.ok(error instanceof u.UmfError && error.code === 'LIMIT'); count.aggregateSerializationRefusals++; }
   }
   assert.ok(count.aggregateSerializationRefusals, 'oversized aggregate receipt must refuse explicitly');
  }
  for (const [index, row] of b.rows.entries()) {
   if (index % 40 === 0) progress(system, index);
   const before = u.copyJson(row.author), r = await b.project(row); assert.deepEqual(row.author, before);
   count.authoredCases++; resultContract(r, row.request.mode); assert.equal(r.mapping.origin, 'authored');
   if (row.request.obligation === 'exact-input' && r.residuals.some((x: any) => x.reason.includes('1.0000000000000002'))) count.floatNarrowing++;
   if (r.status === 'blocked') { count[row.request.mode === 'strict' ? 'strictBlocks' : 'reportBlocks']++; continue; }
   assert.equal(r.status, 'projected'); count.projected++;
   if (r.residuals.length) count.reportResiduals++;
   for (const format of ['json', 'yaml'] as const) { assert.deepEqual(await b.recover(serialized(r, format)), row.author.target); count.idealRecoveries++; }
   const c = await b.classify(r, row, index), source = u.copyJson(c.source);
   let report: any;
   for (const mode of ['strict', 'report'] as const) {
    const classified = await c.classify(mode); assert.deepEqual(c.source, source); resultContract(classified, mode);
    assert.equal(classified.mapping.origin, 'classified');
    if (classified.status === 'blocked') { count.classificationBlocks++; assert.equal(mode, 'strict'); continue; }
    assert.equal(classified.status, 'classified');
    assert.deepEqual(classified.target.extensions.future, c.source.extensions!.future);
    for (const format of ['json', 'yaml'] as const) { assert.deepEqual(await c.recover(serialized(classified, format)), c.native); count.nativeRecoveries++; }
    if (mode === 'report') report = classified;
   }
   assert.ok(report, 'report classification must retain emitted native target');
   const authored = row.author.operation === 'declare-core-facets' ? row.author.request : {};
   const same = Object.entries(authored).every(([key, value]) => JSON.stringify(report.mapping.facets[key]) === JSON.stringify(value));
   if (!Object.keys(authored).length) count.facetlessControls++;
   else if (same) {
    count.nonemptyMatches++;
    if (!r.residuals.length && !report.residuals.length) count.usefulExactMappings++;
   } else { assert.ok(r.residuals.length + report.residuals.length, `${system}: unreported facet difference`); count.residualComparisons++; }
  }
  assert.ok(count.strictBlocks && count.reportResiduals && count.idealRecoveries && count.nativeRecoveries, `${system}: incomplete strict/report recovery coverage`);
  assert.ok(count.floatNarrowing, `${system}: missing float narrowing counterexample`);
 }
 assert.ok(facetSystems.filter(s => coverage[s].usefulExactMappings > 0).length >= 2, 'ideal admission needs two useful nonempty qualified mappings');
 return coverage;
}
