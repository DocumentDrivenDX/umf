// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {declareCoreCardinality,type Document,projectCardinalityToPostgresql,recoverCardinalityFromPostgresql} from '../../src/index-node-v4';
import {backend} from '../../native/postgresql/runtime';

function author(cardinality:'one'|'array'){
 const source:Document={umf:'0.10.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'f',kind:'field',extensions:{}}]}]};
 return declareCoreCardinality(source,{module:'m',element:'f'},{cardinality});
}

const request={id:'pg-authored-cardinality',namespace:'public',tableName:'values',columnName:'value',nativeType:'integer',storage:'scalar',requireExactValues:false,mode:'report'} as const;

test('public authored PostgreSQL cardinality projection verifies, recovers, and refuses an unexpressed shape',async()=>{
 const declaration=author('one');
 const receipt=await projectCardinalityToPostgresql(declaration,request,backend);
 expect(receipt.status).toBe('projected');
 expect(receipt.mapping.outcome).toBe('exact');
 expect(receipt.target).toBeDefined();
 expect(await recoverCardinalityFromPostgresql(receipt,receipt.nativeSql!,backend)).toEqual(declaration.target);

 const refused=await projectCardinalityToPostgresql(author('array'),{...request,mode:'strict'},backend);
 expect(refused.status).toBe('blocked');
 expect(refused.diagnostics.some(d=>d.code==='CARDINALITY_MEANING_NOT_PROJECTED'&&d.severity==='error')).toBe(true);
});
