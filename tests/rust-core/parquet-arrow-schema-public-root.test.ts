import {expect,test} from 'bun:test';
import {captureParquet,exportParquetCapture,getParquetArrowSchema} from '../../src/index-node-v4';

test('Node V4 getParquetArrowSchema is Rust-owned and retains both source authorities',async()=>{
 const bytes=new Uint8Array(await Bun.file('fixtures/parquet/arrow-schema/stored.parquet').arrayBuffer());
 const source=captureParquet(bytes,{id:'parquet-arrow-rust-root'});
 const result=getParquetArrowSchema(source);
 expect(result.status).toBe('decoded');expect(result.complete).toBe(false);expect(result.metadataIndex).toBe(1);
 expect(result.schema).toBeDefined();expect(result.message).toBeDefined();expect(result.source).toEqual(source);
 expect(exportParquetCapture(result.source)).toEqual(bytes);
 const invalid=captureParquet(new Uint8Array([1,2,3]),{id:'parquet-arrow-invalid'});
 const refused=getParquetArrowSchema(invalid);
 expect(refused.status).toBe('blocked');expect(refused.source).toEqual(invalid);expect(refused.complete).toBe(false);
});
