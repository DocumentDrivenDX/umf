import {expect, test} from 'bun:test';
import {
  classifyPostgresqlComposite,
  importPostgresqlCatalogCapture,
  recoverPostgresqlCompositeCapture,
} from '../../src/index-node-v4';

const fixture = await Bun.file('fixtures/validation/field-postgresql-native.json').json();
// Derived input for one complete captured composite, not a fresh native capture.
// Shared definitions and opaque query/reconstruction archives remain untouched.
const capture = JSON.parse(fixture.nativeSource);
const address = capture.snapshot.compositeTypes.find((type: {schema:string;name:string}) => type.schema === 'sales' && type.name === 'address');
if (!address) throw new Error('Captured sales.address fixture is required');
const nativeSource = JSON.stringify({...capture,snapshot:{...capture.snapshot,relations:[],compositeTypes:[address],dependencies:capture.snapshot.dependencies.filter((row:{dependent:{schema:string;name:string}})=>row.dependent.schema==='sales'&&row.dependent.name==='address')}});
const source = () => importPostgresqlCatalogCapture(nativeSource, {id: 'composites'});
const request = {
  recordModule: 'composites',
  recordId: 'record',
  mode: 'strict' as const,
  nativeSource,
  relation: {schema: 'sales', name: 'address'},
};

test('Rust PostgreSQL composite classification builds and recovers the checked member roles', () => {
  const document = source();
  const result = classifyPostgresqlComposite(document, request);
  expect(result.status).toBe('classified');
  expect(result.source).toEqual(document);
  const module = result.target!.modules.at(-1)!;
  expect(module.namespace).toBe('sales');
  expect(module.elements[0]!.kind).toBe('record');
  expect(module.elements.slice(1).map(element => element.name)).toEqual(['street', 'tags']);
  expect(module.elements.slice(1).every(element => element.kind === 'field' && !('scalarType' in element))).toBe(true);
  expect(recoverPostgresqlCompositeCapture(result, result.target!)).toBe(nativeSource);
});

test('Rust PostgreSQL composite classification refuses module collisions and stale targets', () => {
  const document = source();
  document.modules.push({id: 'composites', namespace: 'authored', elements: [{id: 'record', kind: 'group', extensions: {}}]});
  expect(classifyPostgresqlComposite(document, request).status).toBe('blocked');

  const result = classifyPostgresqlComposite(source(), request);
  const changed = structuredClone(result.target!);
  changed.modules.at(-1)!.elements[0]!.name = 'changed';
  expect(() => recoverPostgresqlCompositeCapture(result, changed)).toThrow('Current model changed');
});
