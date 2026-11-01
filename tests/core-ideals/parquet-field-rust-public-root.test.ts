// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyParquetField,recoverParquetFieldBytes,importParquetSchema,declareCoreElementKind} from '../../src/index-node-v4';

async function load(path:string){const bytes=new Uint8Array(await Bun.file(path).arrayBuffer());return {bytes,source:importParquetSchema(bytes,{id:path})};}

test('Node V4 classifies an authored Parquet leaf through Rust and recovers exact source bytes',async()=>{
 const {bytes,source}=await load('fixtures/parquet/logical/uuid.parquet');
 const element=source.modules.find(module=>module.id==='parquet.fields')!.elements[0]!;
 const author=declareCoreElementKind(source,{module:'parquet.fields',element:element.id},'field');
 const receipt=classifyParquetField(author.target,{index:1,mode:'strict',author});
 expect(receipt.status).toBe('classified');
 expect(receipt.mapping.nativePath).toBe('/schema/1');
 expect(receipt.target!.modules.find(module=>module.id==='parquet.fields')!.elements[0]!.kind).toBe('field');
 expect(recoverParquetFieldBytes(receipt,receipt.target!)).toEqual(bytes);
},30000);

test('Node V4 refuses to classify a Parquet group as a primitive Field',async()=>{
 const {source}=await load('fixtures/parquet/containers/list-tuple.parquet');
 const receipt=classifyParquetField(source,{index:1,mode:'strict'});
 expect(receipt.status).toBe('blocked');
 expect(receipt.target).toBeUndefined();
 expect(receipt.mapping.outcome).toBe('unknown');
 expect(receipt.diagnostics[0]?.code).toBe('FIELD_KIND_CONFLICT');
},30000);
