import {writeFile} from 'node:fs/promises';
import {inspectBinding, migrateBindingRelationships, type Document} from '../../src';
import postgresql from '../../fixtures/binding/postgresql-indexes/case.json';
import {bindingMigrationCase} from '../../scripts/binding/stable-ids-cases';

const clone = <T>(value: T): T => structuredClone(value);
const payload = (binding: Document) => binding.extensions!['umf.binding'] as any;
const cases: Record<string, unknown> = {};
const run = (name: string, binding: Document, logical: Document) => { cases[name] = inspectBinding(binding, logical); };
{
  const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
  delete payload(binding).target;
  run('schema/missing-target', binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
  binding.modules.push({id: 'unexpected', namespace: 'unexpected', elements: []});
  run('scope/nonempty-binding-modules', binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
  payload(binding).elements.push(clone(payload(binding).elements[0]));
  run('duplicate/element-assignment', binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
  payload(binding).fields.push(clone(payload(binding).fields[0]));
  run('duplicate/field-assignment', binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
  payload(binding).indexes.push(clone(payload(binding).indexes[0]));
  run('duplicate/index-name', binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
  payload(binding).indexes[0].on.push(clone(payload(binding).indexes[0].on[0]));
  run('duplicate/index-target', binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
  payload(binding).fields[0].path = ['unexpected'];
  run('storage/column-with-path', binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
  const embedded = payload(binding).fields.find((field: any) => field.storage === 'embedded');
  embedded.column = 'shadow';
  run('storage/embedded-with-column', binding, logical);
}
{
  const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
  payload(binding).indexes = [];
  payload(binding).fields[0].field = 'not-a-ddd-field';
  run('reference/exact-ddd-field-required', binding, logical);
}
{
  const {binding: legacy, logical} = bindingMigrationCase();
  const migrated = migrateBindingRelationships(legacy, logical).document;
  run('relationship/stable-id-exact-match', clone(migrated) as Document, clone(logical) as Document);
  const renamed = clone(logical) as Document;
  const row = (renamed.modules[0]!.relationships as any[])[0]!;
  row.name = 'customer-renamed';
  run('relationship/stable-id-survives-name-change', clone(migrated) as Document, renamed);
  const missing = clone(migrated) as Document;
  payload(missing).relationships[0].id = 'missing-stable-id';
  run('relationship/stable-id-missing', missing, clone(logical) as Document);
}
await writeFile(new URL('../../docs/helix/04-build/evidence/rust-migration/r5-binding-inspect/rust-controls/frozen-controls.json', import.meta.url), `${JSON.stringify({bun: Bun.version, cases}, null, 2)}\n`);
