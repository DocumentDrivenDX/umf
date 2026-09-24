// Experimental native decoding evidence, not a UMF import or complete IPC validator.
import {RecordBatchReader,RecordBatchStreamWriter} from 'apache-arrow';
import {describe} from './schema-probe';
export function probeIpc(bytes:Uint8Array){
 const reader=RecordBatchReader.from(bytes).open();
 if(!reader.schema)throw Error('No native schema observed');
 const schema=reader.schema;const descriptor=describe(schema);const format=reader.isFile()?'file':'stream';
 const batches=[...reader];
 const output=batches.length?RecordBatchStreamWriter.writeAll(batches).toUint8Array(true):new RecordBatchStreamWriter().reset(undefined,schema).finish().toUint8Array(true);
 return {descriptor,format,batches:batches.length,rows:batches.reduce((n,b)=>n+b.numRows,0),output};
}
