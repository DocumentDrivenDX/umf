// Optional native backend, separate from the core browser bundle.
import {probe,describe} from './schema-probe';
import {RecordBatchReader} from 'apache-arrow';
export const backend={identity:'apache-arrow@21.2.0' as const,encode(schema:unknown){
 const result=probe(schema);
 // Native descriptors have optional undefined members; omit those in their JSON view.
 return {before:JSON.parse(JSON.stringify(result.before)),after:JSON.parse(JSON.stringify(result.after)),bytes:result.bytes};
}};

export const observationBackend={identity:'apache-arrow@21.2.0' as const,observe(bytes:Uint8Array){
 const reader=RecordBatchReader.from(bytes).open();
 try{
  if(!reader.schema)throw Error('No native schema observed');
  return JSON.parse(JSON.stringify(describe(reader.schema)));
 }finally{reader.cancel();}
}};
export {flatbufferBackend} from './flatbuffer-runtime';
