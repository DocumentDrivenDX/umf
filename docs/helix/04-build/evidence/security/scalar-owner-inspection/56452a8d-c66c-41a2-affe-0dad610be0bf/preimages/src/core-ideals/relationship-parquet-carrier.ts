import {buildAvroRelationshipCarrier,type AvroRelationshipCarrier} from './relationship-avro-carrier';
import {parquetCardinalityFile,type ParquetCardinalityCarrier} from './parquet-cardinality-carrier';
/** Restricted common ASCII naming profile; namespace and keyRecordName are logical labels only. */
export type ParquetRelationshipCarrier=AvroRelationshipCarrier;
export function buildParquetRelationshipCarrier(input:ParquetRelationshipCarrier):Uint8Array {
 buildAvroRelationshipCarrier(input); // Reject unknown request content and malformed common-profile names.
 const types={boolean:'boolean',int:'int32',long:'int64',float:'float32',double:'float64',bytes:'binary',string:'string'} as const;
 const key:ParquetCardinalityCarrier={kind:'record',nullable:input.shape==='nullable-one',fieldId:1,fields:input.components.map((c,i)=>({name:c.name,type:{kind:'scalar',nativeType:types[c.type],nullable:false,fieldId:i+2}}))};
 return parquetCardinalityFile(input.recordName,input.fieldName,input.shape==='array'?{kind:'array',nullable:false,item:key}:key);
}
