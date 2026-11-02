import {expect,test} from 'bun:test';
import {captureParquet,exportParquetCapture,getParquetArrowSchema,renameParquetFieldWithArrowSchema} from '../../src/index-node-v4';

test('Node V4 coordinated Parquet and embedded Arrow rename uses the native codec',async()=>{
 const bytes=new Uint8Array(await Bun.file('fixtures/parquet/arrow-rename/none.parquet').arrayBuffer());
 const source=captureParquet(bytes,{id:'parquet-arrow-rename-rust-root'});
 const policy={parquetIndex:1,arrowFieldPath:[0],name:'renamed',uninterpretedMetadata:'preserve-and-report' as const};
 const result=renameParquetFieldWithArrowSchema(source,policy);
 expect(result.status).toBe('transformed');expect(result.source).toEqual(source);expect(result.output).toBeDefined();
 expect(result.diagnostics.some(d=>d.code==='PARQUET_ARROW_NAME_REFERENCES_UNVERIFIED')).toBe(true);
 expect(result.unchangedPrefixBytes).toBeGreaterThan(0);
 const after=getParquetArrowSchema(result.output!);expect(after.status).toBe('decoded');expect(after.schema).toBeDefined();
 expect(exportParquetCapture(result.output!).subarray(0,result.unchangedPrefixBytes)).toEqual(bytes.subarray(0,result.unchangedPrefixBytes));
 const refused=renameParquetFieldWithArrowSchema(source,{...policy,arrowFieldPath:[99]});
 expect(refused.status).toBe('blocked');expect(refused.output).toBeUndefined();expect(refused.source).toEqual(source);
 let callbackCalls=0;
 const callbackFailure=renameParquetFieldWithArrowSchema(source,policy,{identity:'flatbuffers@25.9.23',encode(){callbackCalls++;throw new Error('test encoder refusal');}});
 expect(callbackCalls).toBe(1);expect(callbackFailure.status).toBe('blocked');expect(callbackFailure.source).toEqual(source);
 expect(callbackFailure.diagnostics.some(d=>d.message==='test encoder refusal')).toBe(true);
});
