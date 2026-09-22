import {encodeParquetWire} from '../adapters/parquet/encode';
import type {ParquetWireValue} from '../adapters/parquet/footer';
import {UmfError} from '../model/types';
export const parquetCarriers={boolean:{type:0},int32:{type:1},int64:{type:2},float32:{type:4},float64:{type:5},binary:{type:6},string:{type:6,converted:0},date:{type:1,converted:6},'time-millis':{type:1,converted:7},'time-micros':{type:2,converted:8},'timestamp-millis-utc':{type:2,converted:9},'timestamp-micros-utc':{type:2,converted:10}} as const;
/** An empty data file carrying an explicit native schema; no row writer or ideal presence inference. */
export function parquetRecordFile(recordName:string,columns:{fieldName:string;nativeType:keyof typeof parquetCarriers;repetition:'required'|'optional'|'repeated'}[]):Uint8Array{
 const text=(value:string):ParquetWireValue=>{if(!value||/[\u0000\uD800-\uDFFF]/u.test(value))throw new UmfError('PARQUET_FIELD_NAME','Nonempty Unicode scalar name without NUL required');return {kind:'binary',hex:Array.from(new TextEncoder().encode(value),b=>b.toString(16).padStart(2,'0')).join('')};};
 const int=(value:number):ParquetWireValue=>({kind:'i32',value:String(value)}),struct=(fields:{id:number;value:ParquetWireValue}[]):ParquetWireValue=>({kind:'struct',fields});
 const root=struct([{id:4,value:text(recordName)},{id:5,value:int(columns.length)}]);
 const fields=columns.map(column=>{const carrier=parquetCarriers[column.nativeType];return struct([{id:1,value:int(carrier.type)},{id:3,value:int({required:0,optional:1,repeated:2}[column.repetition])},{id:4,value:text(column.fieldName)},...('converted'in carrier?[{id:6,value:int(carrier.converted)}]:[])]);});
 const footer=encodeParquetWire(struct([{id:1,value:int(1)},{id:2,value:{kind:'list',elementType:'struct',items:[root,...fields]}},{id:3,value:{kind:'i64',value:'0'}},{id:4,value:{kind:'list',elementType:'struct',items:[]}}]));
 const bytes=new Uint8Array(footer.length+12);bytes.set([80,65,82,49]);bytes.set(footer,4);new DataView(bytes.buffer).setUint32(footer.length+4,footer.length,true);bytes.set([80,65,82,49],footer.length+8);return bytes;
}

export function parquetFieldFile(recordName:string,fieldName:string,nativeType:keyof typeof parquetCarriers,repetition:'required'|'optional'|'repeated'):Uint8Array{return parquetRecordFile(recordName,[{fieldName,nativeType,repetition}]);}
