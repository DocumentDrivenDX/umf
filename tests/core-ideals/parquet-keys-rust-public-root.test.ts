// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyParquetKeys,importParquetSchema,recoverParquetKeySource} from '../../src/index-node-v4';

async function load(path:string){const bytes=new Uint8Array(await Bun.file(path).arrayBuffer());return {bytes,source:importParquetSchema(bytes,{id:path})};}

test('Node V4 reports Parquet physical key observations and retains exact source bytes through Rust',async()=>{
 const {bytes,source}=await load('fixtures/parquet/logical/uuid.parquet');
 const receipt=classifyParquetKeys(source,{mode:'report',profile:'file-schema'});
 expect(receipt.status).toBe('classified');
 expect(receipt.observations.length).toBeGreaterThan(0);
 expect(receipt.observations.every(observation=>observation.authorIntent==='unknown'&&observation.enforcement==='not-expressible')).toBe(true);
 expect(receipt.target!.vocabularies['umf.parquet.keys']?.version).toBe('1.0.0');
 expect(recoverParquetKeySource(receipt,receipt.target!)).toEqual(bytes);
},30000);

test('Node V4 refuses to imply key enforcement in strict Parquet key classification',async()=>{
 const {source}=await load('fixtures/parquet/logical/uuid.parquet');
 const receipt=classifyParquetKeys(source,{mode:'strict',profile:'file-schema'});
 expect(receipt.status).toBe('blocked');
 expect(receipt.target).toBeUndefined();
 expect(receipt.residuals[0]?.outcome).toBe('not-expressible');
 expect(receipt.diagnostics[0]?.code).toBe('PARQUET_KEY_LOSS');
},30000);
