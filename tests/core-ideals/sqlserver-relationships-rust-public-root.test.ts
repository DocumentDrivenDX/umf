// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect, test} from 'bun:test';
import {
  classifySqlServerRelationships,
  importSqlServerCatalog,
  recoverSqlServerRelationshipSource,
  verifySqlServerRelationshipClassification,
} from '../../src/index-node-v4';

const proof = await Bun.file('fixtures/validation/relationship-sqlserver-native.json').json();
const nativeSource = proof.sourceText as string;
const request = {nativeSource, mode: 'report', profile: 'captured-foreign-keys'} as const;

test('Node V4 SQL Server relationship classification preserves native observations and verifies recovery through Rust', () => {
  const source = importSqlServerCatalog(nativeSource, {id: 'sqlserver-relationships'});
  const receipt = classifySqlServerRelationships(source, request);
  expect(receipt.status).toBe('classified');
  expect(receipt.observations.length).toBeGreaterThan(0);
  expect(receipt.observations.every(observation => observation.authorIntent === 'unknown')).toBe(true);
  expect(verifySqlServerRelationshipClassification(receipt, receipt.target!)).toEqual(receipt);
  expect(recoverSqlServerRelationshipSource(receipt, receipt.target!)).toBe(nativeSource);

  const strict = classifySqlServerRelationships(source, {...request, mode: 'strict'});
  expect(strict.status).toBe('blocked');
  expect(strict.target).toBeUndefined();
});
