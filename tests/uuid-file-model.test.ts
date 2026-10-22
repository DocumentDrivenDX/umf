// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {uuidModel,CHILD} from './helpers/uuid-model-fixtures';
import {projectBit128Model,encodeBit128FileRecord,decodeBit128FileRecord,recoverBit128ModelProjection} from '../src';
const uuid='00112233-4455-6677-8899-aabbccddeeff';
test('file/model bundles retain unenforced Keys/relations and pair absence uses one nullable group',()=>{
 for(const system of ['avro','parquet','tablespec'])for(const kind of system==='tablespec'?['uuid-text']:['native-uuid','bytes16','uuid-text','words64']){
  const {binding,logical}=uuidModel(kind,system),r=projectBit128Model(binding,logical,'report');
  expect(r.status).toBe('reported');expect(r.residuals.some(x=>x.path.includes('keys'))).toBe(true);
  expect(projectBit128Model(binding,logical,'strict').status).toBe('blocked');
  expect(JSON.parse(r.candidate!.text).records).toHaveLength(2);
  expect(recoverBit128ModelProjection(r,r.candidate!.text)).toEqual({logical,binding});
  for(const value of [null,{uuid}]){
   const input=[{field:{module:'m',element:'childId'},value:{uuid}},{field:{module:'m',element:'parentRef'},value}];
   const datum=encodeBit128FileRecord(binding,logical,CHILD,input);expect(decodeBit128FileRecord(binding,logical,CHILD,datum)).toEqual(input);
   if(kind==='words64'&&value===null)expect(datum.parent_hi__pair).toBeNull();
   if(kind==='words64')expect(()=>decodeBit128FileRecord(binding,logical,CHILD,{...datum,parent_hi__pair:{parent_hi:'0',parent_lo:null}})).toThrow();
  }
 }
});
test('TableSpec refuses unqualified carriers; native pair group collisions and unsigned Avro refuse',()=>{
 for(const kind of ['words64','native-uuid','bytes16']){const {binding,logical}=uuidModel(kind,'tablespec');expect(()=>projectBit128Model(binding,logical,'report')).toThrow();}
 const {binding,logical}=uuidModel('words64','avro');(binding.extensions!['umf.binding'] as any).fields[0].carrier.signed=false;expect(()=>projectBit128Model(binding,logical,'report')).toThrow();
});
test('native pair paths are explicit and named Avro types cannot collide with root Records',()=>{
 const {binding,logical}=uuidModel('words64','avro');(binding.extensions!['umf.binding'] as any).elements[0].table='umf_0_0_pair';
 const result=projectBit128Model(binding,logical,'report'),schema=JSON.parse(result.candidate!.text).records[0];
 expect(schema.namespace).not.toBe(schema.fields[0].type.namespace);
 expect(result.mappings[1]!.fields[1]!.paths).toEqual([['parent_hi__pair','parent_hi'],['parent_hi__pair','parent_lo']]);
});
test('Parquet paired groups retain explicitly unsigned64 words without number conversion',()=>{
 const {binding,logical}=uuidModel('words64','parquet','uuid',false),r=projectBit128Model(binding,logical,'report');
 const schema=JSON.parse(r.candidate!.text);expect(schema.records[0].columns[0].children[0].isSigned).toBe(false);
 const values=[{field:{module:'m',element:'childId'},value:{uuid:'ffffffff-ffff-ffff-ffff-ffffffffffff'}},{field:{module:'m',element:'parentRef'},value:null}];
 const encoded=encodeBit128FileRecord(binding,logical,CHILD,values);expect(encoded.id_hi__pair).toEqual({id_hi:'18446744073709551615',id_lo:'18446744073709551615'});expect(decodeBit128FileRecord(binding,logical,CHILD,encoded)).toEqual(values);
});
test('TableSpec CSV requiredness remains an explicit residual and complete-row decode rejects native invalid data',()=>{
 const {binding,logical}=uuidModel('uuid-text','tablespec'),r=projectBit128Model(binding,logical,'report');expect(r.residuals.some(x=>x.reason.includes('CSV requiredness'))).toBe(true);
 expect(()=>decodeBit128FileRecord(binding,logical,CHILD,{id:null,parent:null})).toThrow();expect(()=>decodeBit128FileRecord(binding,logical,CHILD,{id:'malformed',parent:null})).toThrow();
});
