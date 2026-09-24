import {copyJson} from '../model/json';
import {UmfError} from '../model/types';
import {parquetFacetFile,type ParquetFacetCarrier} from './parquet-facet-carrier';
import {captureParquet} from '../adapters/parquet';
import {decodeParquetFooter,type ParquetWireValue} from '../adapters/parquet/footer';
import {encodeParquetWire} from '../adapters/parquet/encode';
/** Compose validated scalar declarations into one empty native record file. No row writer. */
export function parquetKeyFile(recordName:string,input:{name:string;carrier:ParquetFacetCarrier;fieldId?:number}[]):Uint8Array {
 const columns=copyJson(input) as unknown as typeof input;
 if(!columns.length||columns.length>1000)throw new UmfError('PARQUET_KEY_CARRIER','Expected 1..1000 native scalar fields');
 const names=new Set<string>(),ids=new Set<number>(),leaves:ParquetWireValue[]=[];let footer:Extract<ParquetWireValue,{kind:'struct'}>|undefined,root:Extract<ParquetWireValue,{kind:'struct'}>|undefined;
 for(const column of columns){
  if(names.has(column.name)||column.fieldId!==undefined&&ids.has(column.fieldId))throw new UmfError('PARQUET_KEY_CARRIER','Duplicate native field name or field ID');names.add(column.name);if(column.fieldId!==undefined)ids.add(column.fieldId);
  const bytes=parquetFacetFile({recordName,fieldName:column.name,nullable:false,carrier:column.carrier,...(column.fieldId===undefined?{}:{fieldId:column.fieldId})});
  const decoded=decodeParquetFooter(captureParquet(bytes,{id:'key-carrier'})).value;
  if(decoded?.kind!=='struct')throw new UmfError('PARQUET_KEY_CARRIER','Generated footer could not be decoded');
  const schema=decoded.fields.find(f=>f.id===2)?.value;
  if(schema?.kind!=='list'||schema.items.length!==2||schema.items[0]?.kind!=='struct')throw new UmfError('PARQUET_KEY_CARRIER','Expected scalar schema');
  footer??=decoded;root??=schema.items[0];leaves.push(schema.items[1]!);
 }
 root!.fields.find(f=>f.id===5)!.value={kind:'i32',value:String(leaves.length)};
 footer!.fields.find(f=>f.id===2)!.value={kind:'list',elementType:'struct',items:[root!,...leaves]};
 const encoded=encodeParquetWire(footer!),bytes=new Uint8Array(encoded.length+12);bytes.set([80,65,82,49]);bytes.set(encoded,4);new DataView(bytes.buffer).setUint32(encoded.length+4,encoded.length,true);bytes.set([80,65,82,49],encoded.length+8);return bytes;
}
