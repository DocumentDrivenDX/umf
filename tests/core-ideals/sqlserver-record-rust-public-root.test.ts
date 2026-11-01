// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifySqlServerRecord,recoverSqlServerRecordCapture,importSqlServerCatalog,getSqlServerColumnMetadata,declareCoreElementKind} from '../../src/index-node-v4';

const nativeSource=await Bun.file('fixtures/sqlserver/catalog.json').text();
const source=()=>importSqlServerCatalog(nativeSource,{id:'sqlserver-record'});
const request={recordModule:'sales-records',recordId:'types',mode:'strict' as const,nativeSource,relation:{schema:'sales',name:'Types'}};

test('Node V4 SQL Server record declaration classifies the captured table and recovers exact catalog text through Rust',()=>{
 const document=source(),receipt=classifySqlServerRecord(document,request);
 expect(receipt.status).toBe('classified');
 expect(receipt.target!.modules.at(-1)!.elements[0]!.kind).toBe('record');
 expect(recoverSqlServerRecordCapture(receipt,receipt.target!)).toBe(nativeSource);
});

test('Node V4 SQL Server record declaration refuses a valid authored Record receipt that conflicts with native member interpretation',()=>{
 const document=source(),member=getSqlServerColumnMetadata(document).find(column=>column.table.name==='Types'&&column.element.scalarType===undefined)!;
 const author=declareCoreElementKind(document,{module:'sqlserver.columns',element:member.path},'record');
 const receipt=classifySqlServerRecord(author.target,{...request,authors:[author]});
 expect(receipt.status).toBe('blocked');
 expect(receipt.target).toBeUndefined();
 expect(receipt.diagnostics.some(diagnostic=>diagnostic.severity==='error')).toBe(true);
});
