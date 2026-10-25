import {writeFile} from 'node:fs/promises';
import {inspectBinding, type Document} from '../../src';
import delta from '../../fixtures/binding/delta/case.json';
import iceberg from '../../fixtures/binding/iceberg/case.json';
import parquet from '../../fixtures/binding/parquet/case.json';
import postgresql from '../../fixtures/binding/postgresql-indexes/case.json';
import sqlserver from '../../fixtures/binding/sqlserver-indexes/case.json';
import {uuidBinding, uuidDocument} from '../helpers/uuid-fixtures';

const clone = <T>(value: T): T => structuredClone(value);
const payload = (binding: Document) => binding.extensions!['umf.binding'] as any;
const profiles = {delta, iceberg, parquet, postgresql, sqlserver};
const inspect = (binding: Document, logical: Document) => inspectBinding(binding, logical);
const results: Record<string, unknown> = {};
for (const [name, fixture] of Object.entries(profiles)) {
  results[`profile/${name}`] = inspect(clone(fixture.binding) as Document, clone(fixture.logical) as Document);
}
{
  const binding = clone(sqlserver.binding) as Document;
  const logical = clone(sqlserver.logical) as Document;
  binding.vocabularies['umf.binding']!.version = '0.2.0';
  payload(binding).profile = 'umf-binding-2';
  results['profile/stable-ids-0.2'] = inspect(binding, logical);
}
results['profile/bit128-0.3'] = inspect(uuidBinding(), uuidDocument());
{
  const binding = clone(postgresql.binding) as Document;
  const logical = clone(postgresql.logical) as Document;
  payload(binding).future = {opaque: ['retain', 7]};
  results['unknown/retained-only'] = inspect(binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document;
  const logical = clone(postgresql.logical) as Document;
  payload(binding).indexes[0].future = {operator: 'opaque'};
  payload(binding).indexes[0].kind = 'unique';
  payload(binding).indexes[0].unique = false;
  results['unknown/crossed-invalid-index'] = inspect(binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document;
  const logical = clone(postgresql.logical) as Document;
  payload(binding).elements[0].element = 'missing-element';
  results['reference/missing-element'] = inspect(binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document;
  const logical = clone(postgresql.logical) as Document;
  payload(binding).logical.documentId = 'other-model';
  results['model/identity-mismatch'] = inspect(binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document;
  const logical = clone(postgresql.logical) as Document;
  (logical as {umf: string}).umf = '9.99.0';
  results['model/invalid-logical'] = inspect(binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document;
  const logical = clone(postgresql.logical) as Document;
  binding.vocabularies['umf.binding']!.version = '9.9.9';
  payload(binding).logical.documentId = 'other-model';
  results['precedence/invalid-binding-before-pair-check'] = inspect(binding, logical);
}
{
  const binding = uuidBinding();
  const logical = uuidDocument();
  payload(binding).logical.documentId = 'other-model';
  results['profile/bit128-pair-mismatch'] = inspect(binding, logical);
}
await writeFile(new URL('../../docs/helix/04-build/evidence/rust-migration/r5-binding-inspect/frozen-inspections.json', import.meta.url), `${JSON.stringify({bun: Bun.version, cases: results}, null, 2)}\n`);
