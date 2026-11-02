// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {classifyParquetRelationships,verifyParquetRelationshipClassification,recoverParquetRelationshipSource} from '../../src/index-node-v4';
import {importParquetSchema} from '../../src/adapters/parquet/field-metadata';

test('Node V4 Parquet relationship observation classifies, verifies, recovers and refuses strict promotion through Rust',async()=>{
 const bytes=new Uint8Array(await Bun.file('fixtures/parquet/containers/list-tuple.parquet').arrayBuffer());
 const source=importParquetSchema(bytes,{id:'relationship-observation'});
 const receipt=classifyParquetRelationships(source,{mode:'report',profile:'file-schema'});
 expect(receipt.status).toBe('classified');
 expect(receipt.observations.length).toBeGreaterThan(0);
 expect(receipt.observations.every(row=>row.authorIntent==='unknown'&&row.enforcement==='not-expressible')).toBe(true);
 expect(verifyParquetRelationshipClassification(receipt,receipt.target!)).toEqual(receipt);
 expect(recoverParquetRelationshipSource(receipt,receipt.target!)).toEqual(bytes);
 const strict=classifyParquetRelationships(source,{mode:'strict',profile:'file-schema'});
 expect(strict.status).toBe('blocked');
 expect(strict.target).toBeUndefined();
});
