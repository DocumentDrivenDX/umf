import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {expect, test} from 'bun:test';
import {inspectBinding, migrateBindingRelationships, type Document} from '../../src';
import postgresql from '../../fixtures/binding/postgresql-indexes/case.json';
import {bindingMigrationCase} from '../../scripts/binding/stable-ids-cases';
import controls from '../../docs/helix/04-build/evidence/rust-migration/r5-binding-inspect/rust-controls/frozen-controls.json';

const manifest = await Bun.file(new URL('../../docs/helix/04-build/evidence/rust-migration/r5-binding-inspect/rust-controls/source-hashes.json', import.meta.url)).json() as {runtime: {bun: string; packageManager: string}; files: Record<string, string>};
const expected = controls.cases as Record<string, unknown>;
const rustProfile = await Bun.file(new URL('../../docs/helix/04-build/evidence/rust-migration/r5-binding-inspect/rust-controls/rust-profile.json', import.meta.url)).json();
const clone = <T>(value: T): T => structuredClone(value);
const payload = (binding: Document) => binding.extensions!['umf.binding'] as any;
const capture = (name: string, binding: Document, logical: Document) => expect(inspectBinding(binding, logical), name).toEqual(expected[name] as any);

test('Rust control addendum pins the approved predecessor, supplemental control capture, and exact runtime', async () => {
  expect(Bun.version).toBe(manifest.runtime.bun);
  expect(controls.bun).toBe(manifest.runtime.bun);
  const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
  expect((await Bun.file(resolve(root, 'package.json')).json()).packageManager).toBe(manifest.runtime.packageManager);
  expect(rustProfile.acceptedBindingVocabularyVersions).toEqual(['0.1.0', '0.2.0']);
  expect(rustProfile.unsupportedBindingVocabularyVersions).toEqual([{
    version: '0.3.0',
    result: {
      valid: false, complete: false,
      diagnostics: [{
        code: 'BINDING_PROFILE', path: '/vocabularies/umf.binding/version',
        message: 'Rust inspector supports umf.binding 0.1.0 and 0.2.0 only', severity: 'error',
      }],
    },
  }]);
  for (const [path, digest] of Object.entries(manifest.files)) {
    expect(createHash('sha256').update(await readFile(resolve(root, path))).digest('hex'), path).toBe(digest);
  }
});

test('malformed schema and document scope preserve full predecessor diagnostic order', () => {
  {
    const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
    delete payload(binding).target;
    capture('schema/missing-target', binding, logical);
  }
  {
    const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
    binding.modules.push({id: 'unexpected', namespace: 'unexpected', elements: []});
    capture('scope/nonempty-binding-modules', binding, logical);
  }
});

test('duplicate element, field, index-name, and ordered target diagnostics match exactly', () => {
  {
    const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
    payload(binding).elements.push(clone(payload(binding).elements[0]));
    capture('duplicate/element-assignment', binding, logical);
  }
  {
    const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
    payload(binding).fields.push(clone(payload(binding).fields[0]));
    capture('duplicate/field-assignment', binding, logical);
  }
  {
    const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
    payload(binding).indexes.push(clone(payload(binding).indexes[0]));
    capture('duplicate/index-name', binding, logical);
  }
  {
    const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
    payload(binding).indexes[0].on.push(clone(payload(binding).indexes[0].on[0]));
    capture('duplicate/index-target', binding, logical);
  }
});

test('column and embedded storage conflicts, and exact DDD field matching are frozen', () => {
  {
    const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
    payload(binding).fields[0].path = ['unexpected'];
    capture('storage/column-with-path', binding, logical);
  }
  {
    const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
    payload(binding).fields.find((field: any) => field.storage === 'embedded').column = 'shadow';
    capture('storage/embedded-with-column', binding, logical);
  }
  {
    const binding = clone(postgresql.binding) as Document, logical = clone(postgresql.logical) as Document;
    payload(binding).indexes = [];
    payload(binding).fields[0].field = 'not-a-ddd-field';
    capture('reference/exact-ddd-field-required', binding, logical);
  }
});

test('stable relationship IDs resolve exactly and survive display-name changes', () => {
  const {binding: legacy, logical} = bindingMigrationCase();
  const migrated = migrateBindingRelationships(legacy, logical).document;
  capture('relationship/stable-id-exact-match', clone(migrated) as Document, clone(logical) as Document);
  const renamed = clone(logical) as Document;
  (renamed.modules[0]!.relationships as any[])[0]!.name = 'customer-renamed';
  capture('relationship/stable-id-survives-name-change', clone(migrated) as Document, renamed);
  const missing = clone(migrated) as Document;
  payload(missing).relationships[0].id = 'missing-stable-id';
  capture('relationship/stable-id-missing', missing, clone(logical) as Document);
});
