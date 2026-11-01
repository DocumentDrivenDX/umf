// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {importSqlServerCatalog,getSqlServerColumnMetadata,classifySqlServerCardinality,verifySqlServerCardinalityClassification,recoverSqlServerCardinalitySource} from '../../src/index-node-v4';
const fixture=await Bun.file('fixtures/validation/cardinality-sqlserver-profile-native.json').json();
const nativeSource:string=fixture.nativeSource;
test('SQL Server Cardinality public root classifies an enforced JSON array, verifies, and recovers its source',()=>{
 const source=importSqlServerCatalog(nativeSource,{id:'capture'});
 const column=getSqlServerColumnMetadata(source).find(item=>item.table.name==='array_value')!;
 const request={column:column.path,nativeSource,mode:'strict' as const,profile:'json-array' as const,identity:{module:'logical',element:'value'},constraint:'CK__array_val__value__398D8EEE'};
 const receipt=classifySqlServerCardinality(source,request);
 expect(receipt.status).toBe('classified');
 expect(receipt.mapping.cardinality).toBe('array');
 expect(receipt.target!.modules.find(module=>module.id==='logical')!.elements[0]!.cardinality).toBe('array');
 expect(verifySqlServerCardinalityClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverSqlServerCardinalitySource(receipt,receipt.target!)).toBe(nativeSource);
});
test('SQL Server Cardinality strict unresolved representation is a public refusal',()=>{
 const source=importSqlServerCatalog(nativeSource,{id:'capture'});
 const column=getSqlServerColumnMetadata(source).find(item=>item.element.scalarType!==undefined)!;
 const receipt=classifySqlServerCardinality(source,{column:column.path,nativeSource,mode:'strict',profile:'unresolved',identity:{module:'logical',element:'value'},constraint:null});
 expect(receipt.status).toBe('blocked');
 expect(receipt.target).toBeUndefined();
 expect(receipt.residuals.length).toBeGreaterThan(0);
});
