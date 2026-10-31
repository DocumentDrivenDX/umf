import {describe,expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {GRAPHQL_EXTENSION,graphqlPackage,LINKML_EXTENSION,linkmlPackage,ODCS_EXTENSION,odcsPackage,OPENAPI_EXTENSION,openapiPackage,SQLSERVER_EXTENSION,sqlserverPackage,TABLESPEC_EXTENSION,tablespecPackage} from '../../src/index-v4-default';

describe('default-root adapter package metadata',()=>{
 test('exports implemented adapter constants and exact package manifests',()=>{
  expect([GRAPHQL_EXTENSION,LINKML_EXTENSION,ODCS_EXTENSION,OPENAPI_EXTENSION,SQLSERVER_EXTENSION,TABLESPEC_EXTENSION]).toEqual(['umf.graphql','umf.linkml','umf.odcs','umf.openapi','umf.sqlserver','umf.tablespec']);
  expect([graphqlPackage.id,linkmlPackage.id,odcsPackage.id,openapiPackage.id,sqlserverPackage.id,tablespecPackage.id]).toEqual(['umf.graphql','umf.linkml','umf.odcs','umf.openapi','umf.sqlserver','umf.tablespec']);
 });
 test('default barrel does not source LinkML static values from validator modules',()=>{
  const barrel=readFileSync(fileURLToPath(new URL('../../src/index-v4-default.ts',import.meta.url)),'utf8');
  expect(barrel).toContain("export { LINKML_MERGE_COLLECTIONS } from './adapters/linkml/package';");
  expect(barrel).toContain("export { LINKML_SCALAR_SLOT_FIELDS } from './adapters/linkml/package';");
  expect(barrel).not.toMatch(/export \{ LINKML_(?:MERGE_COLLECTIONS|SCALAR_SLOT_FIELDS) \} from '\.\/adapters\/linkml\/(?:merge|slot-values)'/);
 });

});
