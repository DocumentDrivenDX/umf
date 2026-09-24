import {declareCoreFacets,type CoreFacetPatch} from '../../src/model/facets';
import {declareCoreElementKind} from '../../src/model/field-kind';
import type {Document} from '../../src/model/types';
import type {FacetsParquetRequest} from '../../src/core-ideals/facets-parquet-projection';
const identity={module:'m',element:'value'};
const seeds:{family:string;facets?:CoreFacetPatch;carrier:FacetsParquetRequest['carrier'];exact?:boolean}[]=[
 ...([8,16,32,64] as const).flatMap(bits=>[true,false].map(signed=>({family:'integer',facets:{integerWidth:{bits,signed}},carrier:{kind:'integer' as const,bits,signed}}))),
 {family:'integer',facets:{integerWidth:{bits:7,signed:true}},carrier:{kind:'integer',bits:8,signed:true}},
 ...(['int32','int64','bytes','fixed'] as const).map(carrier=>({family:'decimal',facets:{precision:4,scale:2},carrier:{kind:'decimal' as const,carrier,precision:4,scale:2,...(carrier==='fixed'?{bytes:2}:{})}})),
 {family:'decimal',facets:{precision:77,scale:0},carrier:{kind:'decimal',carrier:'bytes',precision:77,scale:0}},
 {family:'binary',facets:{length:{max:2,unit:'byte'}},carrier:{kind:'fixed',bytes:2}},
 {family:'binary',facets:{length:{max:0,unit:'byte'}},carrier:{kind:'fixed',bytes:0}},
 {family:'string',facets:{length:{max:1,unit:'unicode-scalar'}},carrier:{kind:'primitive',nativeType:'string'}},
 {family:'float',carrier:{kind:'primitive',nativeType:'float32'},exact:true},
];
export function parquetFacetProjectionCases(){
 return seeds.flatMap((seed,i)=>{
  const document:Document={umf:'0.5.0',id:`ideal-${i}`,vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'value',name:'value',kind:'field',cardinality:'one',scalarType:seed.family,extensions:{}}]}]};
  const author=seed.facets?declareCoreFacets(document,identity,seed.facets):declareCoreElementKind(document,identity,'field');
  return (['declared-schema','pyarrow-21'] as const).flatMap(profile=>(['native-type','metadata-only','carrier-only'] as const).flatMap(encoding=>(['strict','report'] as const).map(mode=>({id:`${i}-${profile}-${encoding}-${mode}`,author,request:{id:'native',recordName:'Record',fieldName:'value',nullable:false,carrier:seed.carrier,mode,encoding,profile,obligation:seed.exact?'exact-input':'value-domain'} as FacetsParquetRequest}))));
 });
}
