import {writeFile} from 'node:fs/promises';
import {projectBindingIndexes, type Document} from '../../src';
import deltaCase from '../../fixtures/binding/delta/case.json';
import icebergCase from '../../fixtures/binding/iceberg/case.json';
import parquetCase from '../../fixtures/binding/parquet/case.json';
import postgresCase from '../../fixtures/binding/postgresql-indexes/case.json';
import sqlserverCase from '../../fixtures/binding/sqlserver-indexes/case.json';

const inputs = {delta: deltaCase, iceberg: icebergCase, parquet: parquetCase, postgresql: postgresCase, sqlserver: sqlserverCase};
const output: Record<string, unknown> = {};
for (const [name, value] of Object.entries(inputs)) {
  const logical = structuredClone(value.logical) as Document;
  const binding = structuredClone(value.binding) as Document;
  output[name] = {
    report: projectBindingIndexes(binding, logical, 'report'),
    strict: projectBindingIndexes(binding, logical, 'strict'),
  };
}
await writeFile(
  new URL('../../docs/helix/04-build/evidence/rust-migration/r5-binding-index-projection/frozen-projections.json', import.meta.url),
  `${JSON.stringify({bun: Bun.version, cases: output}, null, 2)}\n`,
);
