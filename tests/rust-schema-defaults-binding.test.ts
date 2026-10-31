import {expect, test} from 'bun:test';
import {createCoreModelEngine} from '../bindings/core/node/index.js';
import {coreSchema, semanticTypeReferenceSchema, extensionPackageSchema, coreConstraints, domainPolicy} from '../src/generated/core-model';
import {schemaPropertiesFixture} from '../scripts/core-schema-properties-cases';

test('Node resolveCoreDefault preserves predecessor input/result aliasing', () => {
  const engine = createCoreModelEngine({coreSchema, referenceSchema: semanticTypeReferenceSchema, packageSchema: extensionPackageSchema, constraints: coreConstraints, domainPolicy});
  const source = schemaPropertiesFixture();
  const unchanged = engine.resolveCoreDefault(source, {module: 'm', element: 'quantity'}, {state: 'present', value: {integerToken: '2'}});
  expect(unchanged.applied).toBe(false);
  expect(unchanged.result).toBe(unchanged.input);
  const applied = engine.resolveCoreDefault(source, {module: 'm', element: 'quantity'}, {state: 'missing'});
  expect(applied.applied).toBe(true);
  expect(applied.result).not.toBe(applied.input);
});
