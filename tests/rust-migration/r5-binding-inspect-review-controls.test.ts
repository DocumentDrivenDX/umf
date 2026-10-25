import {expect, test} from 'bun:test';
import {inspectBinding, type Document} from '../../src';
import postgresql from '../../fixtures/binding/postgresql-indexes/case.json';
import frozen from '../../docs/helix/04-build/evidence/rust-migration/r5-binding-inspect/rust-controls/review-controls.json';

const clone = <T>(value: T): T => structuredClone(value);
const payload = (binding: Document) => binding.extensions!['umf.binding'] as any;
const expected = frozen.cases as Record<string, unknown>;
const assertCase = (name: string, binding: Document, logical: Document) => {
  expect(inspectBinding(binding, logical), name).toEqual(expected[name] as any);
};

test('focused Sol review repairs match exact TypeScript predecessor validations', () => {
  {
    const binding = clone(postgresql.binding) as Document;
    const logical = clone(postgresql.logical) as Document;
    (logical as any).future = Number.NaN;
    assertCase('admission/logical-number-before-binding', binding, logical);
  }
  {
    const binding = clone(postgresql.binding) as Document;
    const logical = clone(postgresql.logical) as Document;
    (logical as any)['9'] = Number.NaN;
    (logical as any)['1'] = Number.NaN;
    assertCase('admission/logical-numeric-key-order', binding, logical);
  }
  {
    const binding = clone(postgresql.binding) as Document;
    const logical = clone(postgresql.logical) as Document;
    payload(binding).fields[0].documentColumn = 'shadow';
    assertCase('schema/column-with-document-column', binding, logical);
  }
  {
    const binding = clone(postgresql.binding) as Document;
    const logical = clone(postgresql.logical) as Document;
    const duplicate = {...payload(binding).fields[0], storage: 'embedded', documentColumn: 'doc', path: ['x']};
    delete duplicate.column;
    payload(binding).fields.push(duplicate);
    assertCase('duplicate-field/last-assignment-index-targets', binding, logical);
  }
  {
    const binding = clone(postgresql.binding) as Document;
    const logical = clone(postgresql.logical) as Document;
    payload(binding)['9'] = true;
    payload(binding)['1'] = true;
    assertCase('unknown/ecmascript-numeric-property-order', binding, logical);
  }
  {
    const binding = clone(postgresql.binding) as Document;
    const logical = clone(postgresql.logical) as Document;
    const duplicate = {...payload(binding).fields[1], storage: 'embedded', documentColumn: 'doc', path: ['x']};
    delete duplicate.column;
    payload(binding).fields.push(duplicate);
    assertCase('duplicate-field/last-assignment-include', binding, logical);
  }
});
