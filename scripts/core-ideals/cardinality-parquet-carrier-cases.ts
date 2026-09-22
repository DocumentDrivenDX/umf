import {parquetCarriers} from '../../src/core-ideals/parquet-carriers';
import type {ParquetCardinalityCarrier} from '../../src/core-ideals/parquet-cardinality-carrier';
export function parquetCardinalityCarrierCases(){
 const cases:{id:string;carrier:ParquetCardinalityCarrier}[]=[];
 for(const nativeType of Object.keys(parquetCarriers) as (keyof typeof parquetCarriers)[]){
  for(const nullable of [false,true]){
   const scalar:ParquetCardinalityCarrier={kind:'scalar',nativeType,nullable};
   for(const kind of ['scalar','array','map'] as const){
    const carrier:ParquetCardinalityCarrier=kind==='scalar'?scalar:kind==='array'?{kind,nullable,item:scalar}:{kind,nullable,keyType:'string',value:scalar};
    cases.push({id:`${kind}-${nativeType}-${Number(nullable)}`,carrier:{...carrier,fieldId:37}});
   }
  }
 }
 for(const nullable of [false,true]){
  const scalar:ParquetCardinalityCarrier={kind:'scalar',nativeType:'int32',nullable};
  const map:ParquetCardinalityCarrier={kind:'map',nullable,keyType:'int64',value:scalar};
  const array:ParquetCardinalityCarrier={kind:'array',nullable,item:scalar};
  for(const [name,carrier] of [
   ['nested-array',{kind:'array',nullable,item:array}],
   ['array-map',{kind:'array',nullable,item:map}],
   ['map-array',{kind:'map',nullable,keyType:'string',value:array}],
   ['array-record',{kind:'array',nullable,item:{kind:'record',nullable,fields:[{name:'雪',type:scalar},{name:'__proto__',type:array}]}}],
  ] as [string,ParquetCardinalityCarrier][])cases.push({id:`${name}-${Number(nullable)}`,carrier:{...carrier,fieldId:37}});
 }
 return cases;
}
