import {writeFile} from 'node:fs/promises';
import {inspectBinding, type Document} from '../../src';
import postgresql from '../../fixtures/binding/postgresql-indexes/case.json';

const clone = <T>(value: T): T => structuredClone(value);
const payload = (binding: Document) => binding.extensions!['umf.binding'] as any;
const cases: Record<string, unknown> = {};
{
  const binding = clone(postgresql.binding) as Document;
  const logical = clone(postgresql.logical) as Document;
  (logical as any).future = Number.NaN;
  cases['admission/logical-number-before-binding'] = inspectBinding(binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document;
  const logical = clone(postgresql.logical) as Document;
  (logical as any)['9'] = Number.NaN;
  (logical as any)['1'] = Number.NaN;
  cases['admission/logical-numeric-key-order'] = inspectBinding(binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document;
  const logical = clone(postgresql.logical) as Document;
  payload(binding).fields[0].documentColumn = 'shadow';
  cases['schema/column-with-document-column'] = inspectBinding(binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document;
  const logical = clone(postgresql.logical) as Document;
  const duplicate = {...payload(binding).fields[0], storage: 'embedded', documentColumn: 'doc', path: ['x']};
  delete duplicate.column;
  payload(binding).fields.push(duplicate);
  cases['duplicate-field/last-assignment-index-targets'] = inspectBinding(binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document;
  const logical = clone(postgresql.logical) as Document;
  payload(binding)['9'] = true;
  payload(binding)['1'] = true;
  cases['unknown/ecmascript-numeric-property-order'] = inspectBinding(binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document;
  const logical = clone(postgresql.logical) as Document;
  const duplicate = {...payload(binding).fields[1], storage: 'embedded', documentColumn: 'doc', path: ['x']};
  delete duplicate.column;
  payload(binding).fields.push(duplicate);
  cases['duplicate-field/last-assignment-include'] = inspectBinding(binding, logical);
}
await writeFile(
  new URL('../../docs/helix/04-build/evidence/rust-migration/r5-binding-inspect/rust-controls/review-controls.json', import.meta.url),
  `${JSON.stringify({bun: Bun.version, cases}, null, 2)}\n`,
);
