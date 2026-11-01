// SPDX-License-Identifier: MIT OR Apache-2.0
import {describe,expect,it} from 'bun:test';
import {inspectTableLifecycle} from '../../src/index-node-v4';
import fixture from '../binding/fixtures/table-lifecycle-note.json';

describe('V4 Rust table lifecycle inspection route',()=>{
 it('inspects a complete declaration and retains an invalid declaration with diagnostics',()=>{
  const source=structuredClone(fixture);
  const result=inspectTableLifecycle(source);
  expect(result.valid).toBe(true);
  expect(result.complete).toBe(true);
  expect(result.nativeQualified).toBe(false);
  expect(result.diagnostics).toEqual([]);
  expect(result.source).toEqual(source);

  const invalid=structuredClone(fixture) as any;
  invalid.modules[0].extensions['umf.tables'].tables[0].columns.pop();
  const refused=inspectTableLifecycle(invalid);
  expect(refused.valid).toBe(false);
  expect(refused.diagnostics.map(item=>item.code)).toContain('TABLES_COLUMN_MISSING');
  expect(refused.source).toEqual(invalid);
 });
});
