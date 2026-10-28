import {expect, test} from 'bun:test';
import {createDomainPackSchemaOperation} from '../src/domain-pack-schema.js';

test('opt-in domain-pack wrapper returns isolated canonical schema objects and refuses unknown versions', async () => {
  const canonical = await Bun.file('spec/extensions/domain-pack/schema.json').json();
  const versions = [];
  const operation = createDomainPackSchemaOperation(version => {
    versions.push(version);
    if (version !== '1.0.0') throw new RangeError('DOMAIN_PACK_SCHEMA_VERSION');
    return JSON.stringify(canonical);
  });

  const first = operation('1.0.0');
  expect(first).toEqual(canonical);
  first.properties.id.type = 'integer';
  const second = operation('1.0.0');
  expect(second).toEqual(canonical);
  expect(second).not.toBe(first);
  expect(() => operation('9.9.9')).toThrow('DOMAIN_PACK_SCHEMA_VERSION');
  expect(versions).toEqual(['1.0.0', '1.0.0', '9.9.9']);
  const napiRefusal = createDomainPackSchemaOperation(() => new Error('DOMAIN_PACK_SCHEMA_VERSION'));
  expect(() => napiRefusal('9.9.9')).toThrow('DOMAIN_PACK_SCHEMA_VERSION');
});
