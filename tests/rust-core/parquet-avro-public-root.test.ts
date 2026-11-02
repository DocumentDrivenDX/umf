// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import {importParquetSchema,projectParquetToAvro,type ParquetAvroPolicy} from '../../src/index-node-v4';

test('Parquet schema projects through the public Node root and retains source on loss and refusal',()=>{
 const source=importParquetSchema(readFileSync('fixtures/parquet/avro/nested.parquet'),{id:'native-parquet'});
 const policy:ParquetAvroPolicy={id:'native-avro',recordName:'Events',namespace:'example.events',fieldNames:{},maps:'entry-arrays',lossPolicy:'allow-reported-loss'};
 const projected=projectParquetToAvro(source,policy);
 expect(projected.status).toBe('projected');expect(projected.source).toEqual(source);expect(projected.target).toBeDefined();expect(projected.issues.some(issue=>issue.code==='SCHEMA_ONLY')).toBe(true);
 expect(JSON.parse(projected.nativeSchema!).fields.map((field:any)=>field.name)).toContain('items');
 const strict=projectParquetToAvro(source,{...policy,lossPolicy:'strict'});
 expect(strict.status).toBe('blocked');expect(strict.source).toEqual(source);expect(strict.target).toBeUndefined();
 const embeddedBytes=new Uint8Array(readFileSync('fixtures/parquet/arrow-schema/stored.parquet'));
 const badArrowSchema=new TextEncoder().encode('/////wAC');let encodedStart=-1;for(let i=0;i<=embeddedBytes.length-badArrowSchema.length;i++){let matches=true;for(let j=0;j<badArrowSchema.length;j++)if(embeddedBytes[i+j]!==badArrowSchema[j]){matches=false;break;}if(matches){encodedStart=i;break;}}
 expect(encodedStart).toBeGreaterThanOrEqual(0);embeddedBytes[encodedStart]=0x3f;
 const undecodable=importParquetSchema(embeddedBytes,{id:'bad-arrow-metadata'});
 const refused=projectParquetToAvro(undecodable,{...policy,lossPolicy:'allow-reported-loss'});
 expect(refused.status).toBe('blocked');expect(refused.source).toEqual(undecodable);expect(refused.target).toBeUndefined();expect(refused.issues.some(issue=>issue.code==='EMBEDDED_ARROW_SCHEMA_UNINTERPRETED')).toBe(true);
 expect(()=>projectParquetToAvro(source,{...policy,maps:'map'} as any)).toThrow();
},60_000);
