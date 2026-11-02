import {expect, test} from 'bun:test';
import {
  UmfError,
  editAvroNode,
  exportAvroBundle,
  exportAvroSchema,
  getAvroFieldMetadata,
  getAvroNode,
  importAvroSchema,
} from '../../src/index-node-v4';

test('Node public root imports, reads, edits and exports Avro source while retaining bundle dependencies', () => {
  const document = importAvroSchema(
    '{"type":"record","name":"Person","fields":[{"name":"name","type":"string"}]}',
    {id: 'avro-public-flow'},
  );
  expect(getAvroFieldMetadata(document)).toHaveLength(1);
  expect(getAvroNode(document, '/fields/0/name')).toMatchObject({kind: 'string', value: 'name'});
  const edited = editAvroNode(document, '/fields/0/name', '"fullName"');
  expect(exportAvroSchema(edited)).toContain('fullName');

  const dependencyDocument = importAvroSchema(
    '{"type":"record","name":"Root","fields":[{"name":"child","type":"Child"}]}',
    {
      id: 'avro-bundle-flow',
      dependencies: [{id: 'child-schema', schema: '{"type":"record","name":"Child","fields":[]}'}],
    },
  );
  let refusal: unknown;
  try { exportAvroSchema(dependencyDocument); } catch (error) { refusal = error; }
  expect(refusal).toBeInstanceOf(UmfError);
  expect(refusal).toMatchObject({code: 'AVRO_DEPENDENCIES_REQUIRED'});
  expect(exportAvroBundle(dependencyDocument).dependencies).toHaveLength(1);
}, 60_000);
