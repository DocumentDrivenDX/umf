/** Pinned Iceberg 1.11.0 single-source transform type rules; no value execution. */
export interface IcebergTransformType {
 sourceType:string;
 transform:string;
 status:'compatible'|'incompatible'|'uninterpreted';
 resultType?:string;
 complete:false;
 reason:string;
}
export function inspectIcebergTransformType(sourceType:string,transform:string):IcebergTransformType {
 const result=(status:IcebergTransformType['status'],reason:string,resultType?:string):IcebergTransformType=>({sourceType,transform,status,complete:false,reason,...(resultType===undefined?{}:{resultType})});
 if(sourceType.length>4096||transform.length>4096)return result('uninterpreted','Type or transform exceeds the 4096-character inspection bound');
 const primitives=['boolean','int','long','float','double','date','time','timestamp','timestamptz','timestamp_ns','timestamptz_ns','string','uuid','binary','variant','unknown'];
 let base=sourceType;
 const decimal=/^decimal\(\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(sourceType),fixed=/^fixed\[(\d+)\]$/.exec(sourceType);
 if(decimal){const p=BigInt(decimal[1]!),s=BigInt(decimal[2]!);if(p<1n||p>38n||s>p)return result('incompatible','Invalid decimal precision/scale');base='decimal';}
 else if(fixed){const size=BigInt(fixed[1]!);if(size<1n||size>2147483647n)return result('incompatible','Invalid fixed length');base='fixed';}
 else if(!primitives.includes(base))return result('uninterpreted','Source type is outside the interpreted primitive profile');
 if(base==='unknown')return result('uninterpreted','Unknown source type has no established transform semantics');
 let name=transform;
 const parameter=/^(bucket|truncate)\[(\d+)\]$/.exec(transform);
 if(parameter){const n=BigInt(parameter[2]!);if(n<1n||n>2147483647n)return result('incompatible','Transform parameter must be a positive signed int32');name=parameter[1]!;}
 else if(!['identity','void','year','month','day','hour'].includes(name))return result('uninterpreted','Unknown transform preserved; no write compatibility claim');
 const timestamps=['timestamp','timestamptz','timestamp_ns','timestamptz_ns'];
 const allowed=name==='void'||name==='identity'&&base!=='variant'
  ||name==='bucket'&&['int','long','decimal','date','time',...timestamps,'string','uuid','fixed','binary'].includes(base)
  ||name==='truncate'&&['int','long','decimal','string','binary'].includes(base)
  ||['year','month','day'].includes(name)&&['date',...timestamps].includes(base)
  ||name==='hour'&&timestamps.includes(base);
 if(!allowed)return result('incompatible','Transform does not accept this source type in the pinned specification');
 return result('compatible','Single primitive source type rule only; values, table version and field context remain unchecked', ['identity','truncate','void'].includes(name)?sourceType:'int');
}
