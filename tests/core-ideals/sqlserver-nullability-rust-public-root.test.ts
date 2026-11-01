// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {
 importSqlServerCatalog,getSqlServerColumnMetadata,classifySqlServerField,
 classifySqlServerNullability,verifySqlServerNullabilityClassification,recoverSqlServerNullabilitySource,
} from '../../src/index-node-v4';
const fixture=await Bun.file('fixtures/validation/nullability-sqlserver-native.json').json();
const nativeSource:string=fixture.nativeSource;
function selected(){
 const catalog=importSqlServerCatalog(nativeSource,{id:'sqlserver-nullability-public'});
 const column=getSqlServerColumnMetadata(catalog).find(item=>item.table.schema==='availability'&&item.table.name==='plain')!;
 const source=classifySqlServerField(catalog,{column:column.path,nativeSource,mode:'strict'}).target!;
 return {source,column};
}
test('SQL Server Nullability public root admits a scoped stored-column declaration and recovers its capture',()=>{
 const {source,column}=selected();
 const request={column:column.path,nativeSource,scope:'stored-relation' as const,carrier:'sql-null' as const,mode:'strict' as const};
 const receipt=classifySqlServerNullability(source,request);
 expect(receipt.status).toBe('classified');
 expect(receipt.mapping.nullability).toBe('absent-allowed');
 expect(verifySqlServerNullabilityClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverSqlServerNullabilitySource(receipt,receipt.target!)).toBe(nativeSource);
});
test('SQL Server Nullability refuses write-input claims from stored-column metadata',()=>{
 const {source,column}=selected();
 const receipt=classifySqlServerNullability(source,{column:column.path,nativeSource,scope:'write-input',carrier:'sql-null',mode:'strict'});
 expect(receipt.status).toBe('blocked');
 expect(receipt.target).toBeUndefined();
 expect(receipt.mapping.nullability).toBe('unspecified');
 expect(receipt.diagnostics.some(item=>item.severity==='error')).toBe(true);
});
