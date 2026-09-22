import {declareCoreCardinality,type Document,type Element,type ScalarType} from '../../src';
import type {CardinalityParquetRequest,ParquetCardinalityCarrier} from '../../src/core-ideals/cardinality-parquet-projection';
import {parquetCardinalityCarrierCases} from './cardinality-parquet-carrier-cases';
const families:Record<string,ScalarType>={boolean:'boolean',int32:'integer',int64:'integer',float32:'float',float64:'float',binary:'binary',string:'string',date:'date','time-millis':'time','time-micros':'time','timestamp-millis-utc':'timestamp','timestamp-micros-utc':'timestamp'};
export function parquetCardinalityProjectionCases(){
 return parquetCardinalityCarrierCases().flatMap(row=>{
  const source:Document={umf:'0.4.0',id:'ideal-'+row.id,vocabularies:{},modules:[{id:'m',namespace:'',elements:[]}]};
  function add(node:ParquetCardinalityCarrier):string{
   const id='field-'+source.modules[0]!.elements.length;
   const element:Element={id,kind:'field',cardinality:node.kind==='scalar'||node.kind==='record'?'one':node.kind,nullability:node.nullable?'absent-allowed':'required',extensions:{}};
   source.modules[0]!.elements.push(element);
   if(node.kind==='scalar')element.scalarType=families[node.nativeType]!;
   if(node.kind==='array'||node.kind==='map')element.itemType={module:'m',element:add(node.kind==='array'?node.item:node.value)};
   return id;
  }
  const root=add(row.carrier),field=source.modules[0]!.elements[0]!;
  const author=declareCoreCardinality(source,{module:'m',element:root},{cardinality:field.cardinality as 'one'|'array'|'map'});
  return (['strict','report'] as const).map(mode=>({id:row.id+'-'+mode,carrierId:row.id,author,request:{id:'native-'+row.id,recordName:'NativeRecord',fieldName:'value',nativeType:row.carrier,availability:'definition-level',requireExactValues:false,mode} satisfies CardinalityParquetRequest}));
 });
}
