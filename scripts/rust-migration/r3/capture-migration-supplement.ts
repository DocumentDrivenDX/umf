// SPDX-License-Identifier: MIT OR Apache-2.0
/** Immutable source-derived oracle supplement for migration profiles and review controls. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import '../../codegen/entry';
import { compileTableDeployment, verifyTableDeployment } from '../../../src/table-deployment';
import { compileTableMigration, discoverTableMigrationChanges } from '../../../src/table-migration';
import { hashCanonical } from '../../../src/compilation/bundle/hash';
import { legalSource, evolvedLegalSource, indexedLegalSource, moduleId } from '../../../tests/lifecycle/legal-fixture';

const root = resolve(import.meta.dir, '../../..');
const output = resolve(root, 'docs/helix/04-build/evidence/rust-migration/r3/supplement');
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const cmp = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const configuration = { module: moduleId, schema: 'legal_demo', ownerRole: 'legal_owner', personRole: 'legal_person', batchRole: 'legal_batch', groupRoles: { billing_admin: 'legal_billing_admin' } };
const entry = globalThis as unknown as Record<string, (input: string) => string>;
const oracle: Record<string, (input: string) => string> = {
  compileTableMigration: entry.__umf_table_migrate!,
  verifyTableMigration: entry.__umf_table_migration_verify!,
  discoverTableMigrationChanges: entry.__umf_table_migration_changes!,
};
type Case = { id: string; operation: string; request: unknown; expected: unknown; inputSha256: string; resultSha256: string };
const cases: Case[] = [];

function add(id: string, operation: keyof typeof oracle, request: unknown): any {
  const text = JSON.stringify(request);
  const expected = JSON.parse(oracle[operation]!(text));
  cases.push({ id, operation, request, expected, inputSha256: sha(text), resultSha256: sha(JSON.stringify(expected)) });
  return expected;
}
function deploy(source: any): any {
  const result = compileTableDeployment({ text: JSON.stringify(source), configuration });
  if (result.status !== 'compiled') throw new Error(`Fixture source did not compile: ${JSON.stringify(result)}`);
  return result.bundle;
}
function requirePlan(value: any): any {
  if (!value?.result || value.result.status !== 'compiled') throw new Error(`Fixture migration did not compile: ${JSON.stringify(value)}`);
  return value.result.plan;
}
function marker(candidate: any): any {
  const { oldValue: _old, newValue: _new, ...rest } = candidate;
  return rest;
}
function options(reviewedChanges: any[] = [], extra: Record<string, unknown> = {}): any {
  return { version: 'umf.table-migration-options/0.2', backfills: [], concurrentIndexes: [], validations: [], reviewedChanges, ...extra };
}
function candidate(previous: any, next: any, kind: string): any {
  const match = discoverTableMigrationChanges(verifyTableDeployment(previous), verifyTableDeployment(next)).find(item => item.kind === kind);
  if (!match) throw new Error(`Fixture lacks reviewed change ${kind}`);
  return marker(match);
}

const initialSource = legalSource();
const initialBundle = deploy(initialSource);
const initialRequest = { id: 'supplement-001', predecessor: null, previous: null, next: initialBundle };
const initialEnvelope = add('profile/initial-v01', 'compileTableMigration', initialRequest);
const initialPlan = requirePlan(initialEnvelope);
add('verify/initial-v01', 'verifyTableMigration', { plan: initialPlan });

const evolved = evolvedLegalSource(initialSource);
const evolvedBundle = deploy(evolved.source);
const evolvedOptions = { ...structuredClone(evolved.options), version: 'umf.table-migration-options/0.2', reviewedChanges: [], validations: [] };
const forwardRequest = { id: 'supplement-002', predecessor: { id: initialPlan.id, digest: initialPlan.digest }, previous: initialPlan.next, next: evolvedBundle, options: evolvedOptions };
const forwardPlan = requirePlan(add('profile/forward-v02-backfill', 'compileTableMigration', forwardRequest));
add('verify/forward-v02-backfill', 'verifyTableMigration', { plan: forwardPlan });

const indexed = indexedLegalSource(evolved.source);
const concurrentOptions = { ...structuredClone(indexed.options), version: 'umf.table-migration-options/0.1' };
const indexedBundle = deploy(indexed.source);
const concurrentRequest = { id: 'supplement-003', predecessor: { id: forwardPlan.id, digest: forwardPlan.digest }, previous: forwardPlan.next, next: indexedBundle, options: concurrentOptions };
const concurrentPlan = requirePlan(add('profile/legacy-v01-concurrent-indexes', 'compileTableMigration', concurrentRequest));
add('verify/legacy-v01-concurrent-indexes', 'verifyTableMigration', { plan: concurrentPlan });

// Reviewed change kinds are bound to complete source-derived candidates.
const base = legalSource();
const baseBundle = deploy(base);
const reviewCases: Array<{ name: string; source: any; kind: string; previous?: any; conversion?: string }> = [];
{
  const source = structuredClone(base);
  source.modules[0]!.extensions['umf.tables'].tables.find((table: any) => table.id === 'matters').columns.find((column: any) => column.field.element === 'matters__court').name = 'court_name';
  reviewCases.push({ name: 'rename-column', source, kind: 'rename-column' });
}
{
  const source = structuredClone(base);
  source.modules[0]!.extensions['umf.tables'].tables.find((table: any) => table.id === 'clients').policy.person.select = { kind: 'deny' };
  reviewCases.push({ name: 'change-policy', source, kind: 'change-policy' });
}
{
  const source = structuredClone(base);
  source.modules[0]!.extensions['umf.tables'].tables.find((table: any) => table.id === 'matters').indexes.push({ id: 'client_lookup', name: 'matters_client_lookup', fields: [{ module: moduleId, element: 'matters__client_id' }], unique: false, include: [] });
  const before = deploy(source);
  source.modules[0]!.extensions['umf.tables'].tables.find((table: any) => table.id === 'matters').indexes.find((index: any) => index.id === 'client_lookup').name = 'matters_client_lookup_v2';
  const next = deploy(source), mark = candidate(before, next, 'replace-index');
  const request = { id: 'review-index-replace', predecessor: { id: 'old', digest: '1'.repeat(64) }, previous: before, next, options: options([mark]) };
  const plan = requirePlan(add('reviewed/index-replacement', 'compileTableMigration', request));
  add('verify/reviewed-index-replacement', 'verifyTableMigration', { plan });
}
{
  const source = evolvedLegalSource(base).source;
  const before = deploy(source), changed = structuredClone(source);
  changed.modules[0]!.extensions['umf.tables'].tables.find((table: any) => table.id === 'matters').checks.find((check: any) => check.id === 'positive_id').expression.right.value.integerToken = '10';
  reviewCases.push({ name: 'replace-check', source: changed, previous: before, kind: 'replace-check' });
}
{
  const source = structuredClone(base);
  const fk = source.modules[0]!.extensions['umf.tables'].tables.find((table: any) => table.id === 'matter_teams').foreignKeys[0];
  fk.onDelete = 'cascade';
  reviewCases.push({ name: 'replace-foreign-key', source, kind: 'replace-foreign-key' });
}
{
  const source = structuredClone(base);
  const record = source.modules[0]!.elements.find((element: any) => element.id === 'matter_teams');
  record.keys.find((key: any) => key.primary).fields = [{ module: moduleId, element: 'matter_teams__matter_id' }, { module: moduleId, element: 'matter_teams__database_role' }];
  source.modules[0]!.extensions['umf.tables'].commands.find((command: any) => command.id === 'read_matter_teams').body.orderBy = [{ field: { module: moduleId, element: 'matter_teams__matter_id' }, direction: 'asc' }, { field: { module: moduleId, element: 'matter_teams__database_role' }, direction: 'asc' }];
  reviewCases.push({ name: 'replace-primary-key', source, kind: 'replace-primary-key' });
}
for (const item of reviewCases) {
  const previous = item.previous ?? baseBundle;
  const next = deploy(item.source), mark = candidate(previous, next, item.kind);
  if (item.conversion) mark.conversion = item.conversion;
  const request = { id: `review-${item.name}`, predecessor: { id: 'old', digest: '2'.repeat(64) }, previous, next, options: options([mark]) };
  const compiled = add(`reviewed/${item.name}`, 'compileTableMigration', request);
  if (compiled?.result?.status === 'compiled') add(`verify/reviewed-${item.name}`, 'verifyTableMigration', { plan: compiled.result.plan });
  else add(`review-refusal/${item.name}-without-mark`, 'compileTableMigration', { ...request, options: options([]) });
}

// Marker/options/profile refusal controls must retain exact bridge envelopes.
const renameCase = cases.find(item => item.id === 'reviewed/rename-column')!;
const renameRequest = structuredClone(renameCase.request) as any;
const renameMarker = renameRequest.options.reviewedChanges[0];
const stale = structuredClone(renameRequest); stale.options.reviewedChanges[0].oldDigest = '0'.repeat(64);
add('refusal/stale-reviewed-marker', 'compileTableMigration', stale);
const unknown = structuredClone(renameRequest); unknown.options.extra = true;
add('refusal/unknown-options-member', 'compileTableMigration', unknown);
const unused = structuredClone(renameRequest); unused.options.reviewedChanges.push({ ...renameMarker, id: 'review-unused', path: '/unused' });
add('refusal/unused-reviewed-marker', 'compileTableMigration', unused);
const duplicate = structuredClone(renameRequest); duplicate.options.reviewedChanges.push(structuredClone(renameMarker));
add('refusal/duplicate-reviewed-marker', 'compileTableMigration', duplicate);
const initialV02 = { ...initialRequest, id: 'initial-v02', options: options() };
add('refusal/initial-v02-options', 'compileTableMigration', initialV02);
const badVerify = structuredClone(renamePlanFor(renameRequest));
function renamePlanFor(request: any): any {
  const result = compileTableMigration(request);
  if (result.status !== 'compiled') throw new Error(`rename fixture failed: ${JSON.stringify(result)}`);
  return result.plan;
}
badVerify.steps[0].transaction = badVerify.steps[0].transaction === 'forbidden' ? 'required' : 'forbidden';
const { digest: _digest, ...body } = badVerify;
badVerify.digest = hashCanonical(body);
add('refusal/self-rehashed-phase-tamper', 'verifyTableMigration', { plan: badVerify });

// Discovery snapshots retain the complete native entry-wrapper envelope.
for (const [name, previous, next] of [['initial-forward', initialBundle, evolvedBundle], ['forward-indexed', evolvedBundle, indexedBundle]] as const) {
  add(`discovery/${name}`, 'discoverTableMigrationChanges', { previous, next });
}

cases.sort((a, b) => cmp(a.operation, b.operation) || cmp(a.id, b.id));
const content = JSON.stringify({ format: 'umf-r3-migration-supplement/1', cases }, null, 2) + '\n';
const compressionOptions = { level: 9, mtime: 0 };
const compressed = gzipSync(Buffer.from(content, 'utf8'), compressionOptions);
await mkdir(output, { recursive: true });
const fixturePath = resolve(output, 'operations.json.gz');
try { await readFile(fixturePath); throw new Error(`Refusing to overwrite frozen supplement ${fixturePath}`); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
await writeFile(fixturePath, compressed);
const sourcePaths = [
  'scripts/rust-migration/r3/capture-migration-supplement.ts',
  'scripts/codegen/entry.ts',
  'src/table-migration/index.ts', 'src/table-migration/options.ts', 'src/table-migration/reviewed.ts',
  'src/table-migration/phases.ts', 'src/table-migration/phases-options.ts',
  'tests/lifecycle/legal-fixture.ts', 'tests/lifecycle/migration.test.ts', 'tests/lifecycle/reviewed.test.ts',
  'spec/extensions/tables/migration.schema.json', 'spec/extensions/tables/migration-0.2.schema.json',
  'package.json', 'bun.lock',
];
const sourceManifest = { format: 'umf-r3-migration-supplement-sources/1', files: await Promise.all(sourcePaths.sort(cmp).map(async path => ({ path, sha256: sha(await readFile(resolve(root, path))) }))) };
const manifestBytes = JSON.stringify(sourceManifest, null, 2) + '\n';
await writeFile(resolve(output, 'source-manifest.json'), manifestBytes);
const receipt = {
  format: 'umf-r3-migration-supplement-receipt/1',
  oracle: 'scripts/codegen/entry.ts operation wrappers; full ordered input/result envelopes retained in lossless gzip JSON',
  toolchain: { bun: Bun.version, bunReportedNodeCompat: process.version, platform: process.platform, arch: process.arch },
  fixture: { path: 'operations.json.gz', compressedBytes: compressed.length, compressedSha256: sha(compressed), uncompressedBytes: Buffer.byteLength(content), uncompressedSha256: sha(content), caseCount: cases.length },
  sources: { path: 'source-manifest.json', sha256: sha(manifestBytes), count: sourceManifest.files.length },
  coverage: [...new Set(cases.map(item => item.operation))].sort(cmp),
  notes: ['Fixture was captured from the current TypeScript wrappers, not generated Rust expectations.', 'Existing R3 baseline files were not modified.', 'Corpus includes initial, legacy concurrent-index, and phased backfill cohorts; reviewed-change kinds and marker/rehash refusal controls.'],
};
await writeFile(resolve(output, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ cases: cases.length, bytes: compressed.length, sha256: sha(compressed) }));
