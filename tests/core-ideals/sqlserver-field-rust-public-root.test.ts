// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {classifySqlServerField,verifySqlServerFieldClassification,recoverSqlServerFieldCapture,importSqlServerCatalog,getSqlServerColumnMetadata,declareCoreElementKind} from '../../src/index-node-v4';
const nativeSource=await Bun.file('fixtures/sqlserver/catalog.json').text();
const source=()=>importSqlServerCatalog(nativeSource,{id:'sqlserver-public'});
test('public SQL Server Field classification is Rust-backed and recovers the admitted catalog',()=>{
 const document=source(),column=getSqlServerColumnMetadata(document)[0]!;
 const receipt=classifySqlServerField(document,{column:column.path,nativeSource,mode:'strict'});
 expect(receipt.status).toBe('classified');
 expect(verifySqlServerFieldClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverSqlServerFieldCapture(receipt,receipt.target!)).toBe(nativeSource);
});
test('public SQL Server Field classification refuses a valid authored Record receipt that conflicts with native field interpretation',()=>{
 const document=source(),column=getSqlServerColumnMetadata(document).find(candidate=>candidate.element.scalarType===undefined)!;
 const author=declareCoreElementKind(document,{module:'sqlserver.columns',element:column.path},'record');
 const receipt=classifySqlServerField(author.target,{column:column.path,nativeSource,mode:'strict',author});
 expect(receipt.status).toBe('blocked');
 expect(receipt.target).toBeUndefined();
 expect(receipt.diagnostics[0]?.code).toBe('SQLSERVER_FIELD_CONFLICT');
});
