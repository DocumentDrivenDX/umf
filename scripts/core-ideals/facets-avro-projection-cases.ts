import {declareCoreFacets,declareCoreElementKind,type Document,type CoreFacetPatch,type CoreFacetDeclaration,type CoreKindDeclaration} from '../../src';
import type {FacetsAvroRequest} from '../../src/core-ideals/facets-avro-projection';
export const avroFacetIdeal=(scalarType:string):Document=>({umf:'0.5.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'value',name:'value',kind:'field',cardinality:'one',scalarType,extensions:{}}]}]});
export function facetsAvroProjectionCases(){
 const seeds:{id:string;family:string;facets?:CoreFacetPatch;native:Partial<FacetsAvroRequest>}[]=[];
 for(const bits of [8,32,64])for(const signed of [true,false])for(const nativeType of ['int','long'] as const)seeds.push({id:`${nativeType}-${bits}-${signed}`,family:'integer',facets:{integerWidth:{bits,signed}},native:{nativeType}});
 for(const max of [0,2])for(const nativeType of ['string','bytes','fixed'] as const)seeds.push({id:`${nativeType}-${max}`,family:nativeType==='string'?'string':'binary',facets:{length:{max,unit:nativeType==='string'?'unicode-scalar':'byte'}},native:{nativeType,...(nativeType==='fixed'?{fixedName:'Bytes',fixedSize:max}:{})}});
 for(const nativeType of ['decimal-bytes','decimal-fixed'] as const)for(const precision of [3,4])seeds.push({id:`${nativeType}-${precision}`,family:'decimal',facets:{precision,scale:2},native:{nativeType,...(nativeType==='decimal-fixed'?{fixedName:'Decimal',fixedSize:2}:{})}});
 for(const [nativeType,family] of [['boolean','boolean'],['float','float'],['double','float'],['date','date'],['time-millis','time'],['time-micros','time'],['timestamp-millis','timestamp'],['timestamp-micros','timestamp'],['local-timestamp-micros','timestamp']] as const)seeds.push({id:nativeType,family,native:{nativeType}});
 const rows:{id:string;author:CoreFacetDeclaration|CoreKindDeclaration;request:FacetsAvroRequest}[]=[];
 for(const seed of seeds)for(const profile of ['declared-schema','apache-datum-writer','fastavro-schemaless-writer'] as const)for(const encoding of ['native-type','metadata-only','carrier-only'] as const)for(const mode of ['strict','report'] as const){
  const doc=avroFacetIdeal(seed.family),identity={module:'m',element:'value'},author=seed.facets?declareCoreFacets(doc,identity,seed.facets):declareCoreElementKind(doc,identity,'field');
  rows.push({id:`${seed.id}-${profile}-${encoding}-${mode}`,author,request:{id:'native',recordName:'Record',namespace:'example',fieldName:'value',nativeType:'int',profile,encoding,mode,obligation:'value-domain',...seed.native}});
 }
 return rows;
}
