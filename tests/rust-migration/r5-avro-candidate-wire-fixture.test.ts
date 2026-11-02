import { createHash } from 'node:crypto';
import { expect, test } from 'bun:test';

import cases from '../../tests/rust-core/fixtures/r5-avro-candidate-wire/candidate-wire-cases.json';

const sourceFixturePath = cases.sourceFixture.path;
const sourceFixtureBytes = await Bun.file(sourceFixturePath).arrayBuffer();
const sourceFixtureHash = createHash('sha256')
  .update(new Uint8Array(sourceFixtureBytes))
  .digest('hex');
const sourceFixture = JSON.parse(new TextDecoder().decode(sourceFixtureBytes));

function pointer(value: unknown, path: string): unknown {
  return path.split('/').slice(1).reduce<unknown>((current, rawSegment) => {
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(current)) return current[Number(segment)];
    if (current !== null && typeof current === 'object') {
      return (current as Record<string, unknown>)[segment];
    }
    throw new Error(`Cannot resolve ${path} at ${segment}`);
  }, value);
}

test('candidate wire fixture stays bound to its frozen TypeScript source case', () => {
  expect(cases.cases).toHaveLength(16);
  expect(cases.cliCases).toHaveLength(5);
  expect(sourceFixtureHash).toBe(cases.sourceFixture.sha256);
  for (const sourcePath of Object.values(cases.sourceFixture.sourcePointers)) {
    const document = pointer(sourceFixture, sourcePath) as Record<string, unknown>;
    expect(document.umf).toBe('0.10.0');
    expect(Array.isArray(document.modules)).toBe(true);
  }
});

test('wire request contract preserves replacement JSON as text and pins report identity', () => {
  expect(cases.wireProtocol).toBe('umf.core-wire/1');
  expect(cases.operationProfile).toBe('umf-r5-avro-candidate/0.1.0');
  expect(cases.operation).toBe('avro.schema.proposeNodeEdit');
  const exact = cases.cases.find(({ id }) => id === 'root-exact-int64-json-text');
  if (!exact) throw new Error('Missing root-exact-int64-json-text fixture case');
  if (!exact.expected.report) throw new Error('Exact-int64 case is missing its candidate report');
  expect(exact.requestValue.replacementJson).toBe('9223372036854775807');
  expect(typeof exact.requestValue.replacementJson).toBe('string');
  expect(exact.expected.report.forbiddenMembers).toContain('validation');
});

test('frozen case matrix covers refusal precedence and dependency-scope representation', () => {
  const expectedCodes = new Map(
    cases.cases
      .filter(({ expected }) => expected.envelope.status === 'error')
      .map(({ id, expected }) => [id, expected.envelope.code]),
  );
  expect(expectedCodes.get('source-admission-precedes-invalid-pointer')).toBe('AVRO_DOCUMENT');
  expect(expectedCodes.get('stale-field-projection-precedes-representation-and-pointer')).toBe(
    'AVRO_FIELD_METADATA',
  );
  expect(expectedCodes.get('unknown-tagged-representation-precedes-pointer-and-replacement')).toBe(
    'AVRO_REPRESENTATION',
  );
  expect(expectedCodes.get('pointer-syntax-precedes-replacement-parse')).toBe('JSON_SCHEMA_POINTER');
  expect(expectedCodes.get('replacement-parse-precedes-dependency-and-target-resolution')).toBe(
    'JSON_SCHEMA_SYNTAX',
  );
  expect(expectedCodes.get('dependency-id-precedes-target-resolution')).toBe('AVRO_DEPENDENCY_ID');
  expect(expectedCodes.get('attached-field-metadata-rename-refusal')).toBe('AVRO_FIELD_METADATA');

  const dependencyRepresentation = cases.cases.find(
    ({ id }) => id === 'dependency-representation-precedes-root-edit',
  );
  if (!dependencyRepresentation) {
    throw new Error('Missing dependency-representation-precedes-root-edit fixture case');
  }
  const [dependencyPatch] = dependencyRepresentation.documentPatches ?? [];
  if (!dependencyPatch) throw new Error('Dependency representation case is missing its patch');
  expect(dependencyPatch.path).toContain('/dependencies/0/root/');
  expect(dependencyRepresentation.expected.envelope.code).toBe('AVRO_REPRESENTATION');
});

test('CLI fixture remains opt-in with cooperative controls', () => {
  const capabilities = cases.cliCases.find(({ id }) => id === 'capabilities')!;
  expect(capabilities.expectedOperations).toEqual(['avro.schema.proposeNodeEdit']);
  expect(capabilities.defaultAdapterActivation).toBe(false);
  expect(cases.cliCases.find(({ id }) => id === 'max-work-zero')?.expectedCode).toBe('RESOURCE_LIMIT');
  expect(cases.cliCases.find(({ id }) => id === 'timeout-zero')?.expectedCode).toBe('DEADLINE');
});
