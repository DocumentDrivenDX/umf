import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {captureParquet,exportAvroSchema,exportParquetCapture,importAvroSchema,inspectParquetSchema,readDocument,writeDocument} from '../../src';

test('@covers US-045-AC4: native Avro and Parquet value/id carriers preserve sources without authored relationship inference',async()=>{
 const base='fixtures/relationship-native/';
 const oracle=await Bun.file(base+'avro-parquet-oracle.json').json();
 const browser=await Bun.file(base+'avro-parquet-browser.json').json();
 const avroText=await Bun.file(base+'avro-value-and-id.avsc').text();
 const parquetBytes=new Uint8Array(await Bun.file(base+'parquet-value-and-id.parquet').arrayBuffer());
 const avro=importAvroSchema(avroText,{id:'relationship-native-avro'});
 const parquet=captureParquet(parquetBytes,{id:'relationship-native-parquet'});
 expect(exportAvroSchema(avro)).toBe(avroText);
 expect(inspectParquetSchema(parquet).leaves?.map(row=>row.path.join('.'))).toEqual(['customer_value.id','customer_id']);
 expect(exportParquetCapture(parquet)).toEqual(parquetBytes);
 for(const format of ['json','yaml'] as const){
  expect(exportAvroSchema(readDocument(writeDocument(avro,format),format))).toBe(avroText);
  expect(exportParquetCapture(readDocument(writeDocument(parquet,format),format))).toEqual(parquetBytes);
 }
 for(const [name,bytes] of [['avro-value-and-id.avsc',new TextEncoder().encode(avroText)],['parquet-value-and-id.parquet',parquetBytes]] as const){
  expect(oracle.hashes[base+name]).toBe(createHash('sha256').update(bytes).digest('hex'));
 }
 expect(oracle.parquet.runtime).toBe('PyArrow 21.0.0');
 expect(oracle.parquet.nativeColumns).toEqual(['customer_value.id','customer_id']);
 expect(browser.avroRecovered).toBe(true);expect(browser.parquetRecovered).toBe(true);
 expect([...avro.modules,...parquet.modules].some(module=>Object.hasOwn(module,'relationships'))).toBe(false);
 expect(browser.authoredRelationshipInferred).toBe(false);
});
