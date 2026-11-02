// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {
 classifyPostgresqlField,verifyPostgresqlFieldClassification,recoverPostgresqlFieldCapture,
 classifyPostgresqlRecord,verifyPostgresqlRecordClassification,recoverPostgresqlRecordCapture,
 importPostgresqlCatalogCapture,getPostgresqlColumnMetadata,
} from '../../src/index-node-v4';
// Reuse the complete captured Field fixture and its ordinary two-column relation.
const fixture=await Bun.file('fixtures/validation/field-postgresql-native.json').json();
const nativeSource=fixture.nativeSource as string;
const document=()=>importPostgresqlCatalogCapture(nativeSource,{id:'postgresql-native-classification'});
test('Rust PostgreSQL field and record public roots classify, verify and recover retained catalog evidence',()=>{
 const source=document();const column=getPostgresqlColumnMetadata(source).find(c=>c.relation.schema==='support'&&c.relation.name==='scalar_types')!;
 const field=classifyPostgresqlField(source,{column:column.path,nativeSource,mode:'strict'});
 expect(field.status).toBe('classified');expect(verifyPostgresqlFieldClassification(field,field.target!).status).toBe('classified');expect(recoverPostgresqlFieldCapture(field,field.target!)).toBe(nativeSource);
 const request={recordModule:'records',recordId:'customer',mode:'strict' as const,nativeSource,relation:{schema:'support',name:'scalar_types'}};
 const record=classifyPostgresqlRecord(source,request);
 expect(record.status).toBe('classified');expect(verifyPostgresqlRecordClassification(record,record.target!).status).toBe('classified');expect(recoverPostgresqlRecordCapture(record,record.target!)).toBe(nativeSource);
});
test('Rust PostgreSQL Record classification refuses a missing qualified relation',()=>{
 const source=document();
 try{classifyPostgresqlRecord(source,{recordModule:'records',recordId:'missing',mode:'strict',nativeSource,relation:{schema:'support',name:'missing'}});throw new Error('expected native refusal');}
 catch(error){expect(error).toMatchObject({code:'POSTGRESQL_RECORD_IDENTITY'});}
});
