// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyAvroKeys,verifyAvroKeyClassification,recoverAvroKeySource,classifyAvroRelationships,verifyAvroRelationshipClassification,recoverAvroRelationshipSource,importAvroSchema} from '../../src/index-node-v4';

test('Node V4 Avro Key declaration observations and native archive recovery are Rust-backed',async()=>{
 const rows=(await Bun.file('fixtures/avro/key-discovery-cases.json').json()).cases as {id:string;schemaText:string}[];
 const item=rows[0]!,nativeSource={schema:item.schemaText,dependencies:[]},source=importAvroSchema(nativeSource.schema,{id:item.id});
 const request={mode:'report',profile:'schema-declarations',nativeSource} as const;
 const receipt=classifyAvroKeys(source,request);
 expect(receipt.status).toBe('classified');expect(receipt.observations.length).toBeGreaterThan(0);
 expect(verifyAvroKeyClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverAvroKeySource(receipt,receipt.target!)).toEqual(nativeSource);
 const blocked=classifyAvroKeys(source,{...request,mode:'strict'});expect(blocked.status).toBe('blocked');expect(blocked.target).toBeUndefined();
 expect(()=>verifyAvroKeyClassification(blocked as any,source)).toThrow();
},60000);

test('Node V4 Avro Relationship structural observations and archive recovery are Rust-backed',async()=>{
 const rows=(await Bun.file('fixtures/avro/relationship-discovery-cases.json').json()).cases as {id:string;schemaText:string}[];
 const item=rows[0]!,nativeSource={schema:item.schemaText,dependencies:[]},source=importAvroSchema(nativeSource.schema,{id:item.id});
 const request={mode:'report',profile:'schema-structure',nativeSource} as const;
 const receipt=classifyAvroRelationships(source,request);
 expect(receipt.status).toBe('classified');expect(receipt.observations.length).toBeGreaterThan(0);
 expect(verifyAvroRelationshipClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverAvroRelationshipSource(receipt,receipt.target!)).toEqual(nativeSource);
 const blocked=classifyAvroRelationships(source,{...request,mode:'strict'});
 expect(blocked.status).toBe('blocked');expect(blocked.target).toBeUndefined();
 expect(()=>verifyAvroRelationshipClassification(blocked as any,source)).toThrow();
},60000);
