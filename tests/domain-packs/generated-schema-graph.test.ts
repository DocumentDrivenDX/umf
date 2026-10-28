import {expect, test} from 'bun:test';
import {generateDatasetSourceSchema as referenceDatasetSource} from '../../src/domain-packs/source-schema';
import {generateDomainPackSchema as referenceDomainPack} from '../../src/domain-packs/schema';
import {generateDatasetSourceSchema as defaultDatasetSource, generateDomainPackSchema as defaultDomainPack} from '../../src/index-node-v4';
import {datasetSourceSchemaGraphJson, domainPackSchemaGraphJson} from '../../bindings/core/node/index.js';
import {createGeneratedSchemaGraphOperation} from '../../src/domain-packs/generated-schema-graph';

function pointerPath(parent: string, segment: string | number): string {
  return `${parent}/${String(segment).replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

function aliasClasses(root: unknown): string[][] {
  const paths = new WeakMap<object, string[]>();
  const visit = (value: unknown, path: string): void => {
    if (typeof value !== 'object' || value === null) return;
    const locations = paths.get(value) ?? [];
    locations.push(path);
    paths.set(value, locations);
    if (Array.isArray(value)) {
      value.forEach((child, index) => visit(child, pointerPath(path, index)));
    } else {
      for (const key of Object.keys(value)) visit((value as Record<string, unknown>)[key], pointerPath(path, key));
    }
  };
  visit(root, '');
  const groups: string[][] = [];
  const seen = new WeakSet<object>();
  const collect = (value: unknown): void => {
    if (typeof value !== 'object' || value === null || seen.has(value)) return;
    seen.add(value);
    const locations = paths.get(value);
    if (locations && locations.length > 1) groups.push([...locations].sort());
    if (Array.isArray(value)) value.forEach(collect);
    else Object.keys(value).forEach(key => collect((value as Record<string, unknown>)[key]));
  };
  collect(root);
  return groups.sort((a, b) => a[0]!.localeCompare(b[0]!));
}

function wireAliasClasses(json: string): string[][] {
  const graph = JSON.parse(json);
  return graph.aliasGroups.map((group: string[]) => [...group].sort()).sort((a: string[], b: string[]) => a[0]!.localeCompare(b[0]!));
}

test('Rust-owned schema graph metadata exhaustively matches the TS predecessor alias classes', () => {
  expect(defaultDomainPack.name).toBe('generateDomainPackSchema');
  expect(defaultDomainPack.length).toBe(0);
  expect(defaultDatasetSource.name).toBe('generateDatasetSourceSchema');
  expect(defaultDatasetSource.length).toBe(0);
  const cases = [
    {reference: referenceDomainPack(), actual: defaultDomainPack(), wire: domainPackSchemaGraphJson()},
    {reference: referenceDatasetSource(), actual: defaultDatasetSource(), wire: datasetSourceSchemaGraphJson()},
  ];
  for (const item of cases) {
    const expectedAliases = aliasClasses(item.reference);
    expect(item.actual).toEqual(item.reference);
    expect(wireAliasClasses(item.wire)).toEqual(expectedAliases);
    expect(aliasClasses(item.actual)).toEqual(expectedAliases);
    const next = cases[0] === item ? defaultDomainPack() : defaultDatasetSource();
    expect(next).not.toBe(item.actual);
  }
});

test('default schema aliases preserve mutation propagation and isolate later calls', () => {
  const pack = defaultDomainPack() as any;
  expect(pack.properties.id).toBe(pack.properties.family.properties.id);
  pack.properties.id.type = 'integer';
  expect(pack.properties.family.properties.id.type).toBe('integer');
  expect((defaultDomainPack() as any).properties.id.type).toBe('string');

  const source = defaultDatasetSource() as any;
  expect(source.properties.reference).toBe(source.properties.format);
  source.properties.reference.type = 'integer';
  expect(source.properties.provenance.properties.source_ids.items.type).toBe('integer');
  expect((defaultDatasetSource() as any).properties.reference.type).toBe('string');
});

test('schema graph providers fail closed when missing or malformed', () => {
  expect(() => createGeneratedSchemaGraphOperation(undefined as any)).toThrow('Rust schema graph provider is required');
  expect(() => createGeneratedSchemaGraphOperation(() => '{"schema":{},"aliasGroups":[["/missing","/also-missing"]]}')()).toThrow('does not resolve');
  expect(() => createGeneratedSchemaGraphOperation(() => '{"schema":{"a":"x","b":"x"},"aliasGroups":[["/a","/b"]]}')()).toThrow('alias source is not an object');
  expect(() => createGeneratedSchemaGraphOperation(() => '{"schema":{"a":{"type":"string"},"b":{"type":"integer"}},"aliasGroups":[["/a","/b"]]}')()).toThrow('alias values differ');
});

test('generic relinker handles a root parent and defines special keys as own data properties', () => {
  const operation = createGeneratedSchemaGraphOperation(() => '{"schema":{"left":{},"right":{},"__proto__":{"a":1},"prototype":{"a":1}},"aliasGroups":[["/left","/right"],["/__proto__","/prototype"]]}');
  const result = operation() as any;
  expect(result.left).toBe(result.right);
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect(Object.hasOwn(result, '__proto__')).toBe(true);
  expect(result.__proto__).toBe(result.prototype);
});
