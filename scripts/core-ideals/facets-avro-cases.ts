import * as u from '../../src';
import selection from '../../fixtures/avro/facet-selection-cases.json';
export function avroFacetCase(nativeSource:string,scalarType:u.ScalarType,options:Partial<u.AvroFacetRequest>={}){
 const native=u.importAvroSchema(nativeSource,{id:'avro-facets',...(options.dependencies?{dependencies:options.dependencies}:{})});
 const document=u.upgradeFacetEnvelope(u.upgradeCardinalityEnvelope(u.upgradeNullabilityEnvelope(u.upgradeFieldEnvelope(native).target).target).target).target;
 document.modules.push({id:'logical',namespace:'',elements:[{id:'value',kind:'field',cardinality:'one',scalarType,extensions:{}}]});
 const request:u.AvroFacetRequest={location:{path:''},nativeSource,identity:{module:'logical',element:'value'},mode:'report',profile:'declared-schema',obligation:'value-domain',...options};
 return {document,request};
}
export function avroFacetClassificationCases(){
 const result:{id:string;document:u.Document;request:u.AvroFacetRequest}[]=[];
 const scalars:[string,u.ScalarType][]=[['"int"','integer'],['"long"','integer'],['"float"','float'],['"double"','float'],['"bytes"','binary'],['"string"','string'],['{"type":"fixed","name":"Empty","size":0}','binary'],['{"type":"fixed","name":"B","size":2}','binary'],['{"type":"bytes","logicalType":"decimal","precision":3,"scale":2}','decimal'],['{"type":"fixed","name":"D","size":2,"logicalType":"decimal","precision":4,"scale":2}','decimal'],['{"type":"long","logicalType":"future"}','integer'],['{"type":"int","width":8,"unsigned":true}','integer']];
 for(const [index,[text,family]] of scalars.entries())for(const profile of ['declared-schema','apache-datum-writer','fastavro-schemaless-writer','unresolved'] as const)for(const mode of ['strict','report'] as const)
  result.push({id:`scalar-${index}-${profile}-${mode}`,...avroFacetCase(text,family,{profile,mode})});
 for(const row of selection.cases)for(const mode of ['strict','report'] as const){
  const family=(row.families?.find(x=>x!==null)??'integer') as u.ScalarType;
  result.push({id:row.id+'-'+mode,...avroFacetCase(row.schema,family,{location:row.location,...(row.dependencies?{dependencies:row.dependencies}:{}),mode})});
 }
 for(const index of [0,2,3,8])for(const profile of ['declared-schema','apache-datum-writer','fastavro-schemaless-writer','unresolved'] as const)for(const mode of ['strict','report'] as const){
  const [text,family]=scalars[index]!;result.push({id:`exact-input-${index}-${profile}-${mode}`,...avroFacetCase(text,family,{profile,mode,obligation:'exact-input'})});
 }
 return result;
}
