import {declareCoreFacets,declareCoreElementKind,type Document,type CoreFacetPatch,type FacetsPostgresqlRequest,type CoreFacetDeclaration,type CoreKindDeclaration} from '../../src';
export const postgresqlFacetIdeal=(scalarType:string):Document=>({umf:'0.5.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'value',name:'value',kind:'field',scalarType,extensions:{}}]}]});
export function facetsPostgresqlProjectionCases(){
 const seeds:{name:string;family:string;type:FacetsPostgresqlRequest['nativeType'];facets:CoreFacetPatch}[]=[
  ...[0,2,10485760,10485761].flatMap(max=>(['text','varchar','char'] as const).map(type=>({name:`length-${type}-${max}`,family:'string',type,facets:{length:{max,unit:'unicode-scalar' as const}}}))),
  ...[0,2,10485760,10485761].map(max=>({name:'bytes-'+max,family:'binary',type:'bytea' as const,facets:{length:{max,unit:'byte' as const}}})),
  ...[{bits:1,signed:true},{bits:1,signed:false},{bits:8,signed:true},{bits:8,signed:false},{bits:16,signed:true},{bits:16,signed:false}].map(integerWidth=>({name:`smallint-${integerWidth.bits}-${integerWidth.signed}`,family:'integer',type:'smallint' as const,facets:{integerWidth}})),
  ...[{bits:32,signed:true},{bits:32,signed:false},{bits:64,signed:true},{bits:64,signed:false}].map(integerWidth=>({name:`bigint-${integerWidth.bits}-${integerWidth.signed}`,family:'integer',type:'bigint' as const,facets:{integerWidth}})),
  ...[64,128,1024,1025,Number.MAX_SAFE_INTEGER].map(bits=>({name:'numeric-integer-'+bits,family:'integer',type:'numeric' as const,facets:{integerWidth:{bits,signed:false}}})),
  ...[{precision:5,scale:2},{precision:5,scale:0},{precision:3,scale:3},{precision:1000,scale:1000},{precision:1001,scale:0}].map(facets=>({name:`decimal-${facets.precision}-${facets.scale}`,family:'decimal',type:'numeric' as const,facets})),
 ];
 const rows:{name:string;author:CoreFacetDeclaration|CoreKindDeclaration;request:FacetsPostgresqlRequest}[]=[];
 for(const seed of seeds)for(const encoding of ['checked','type-modifier','carrier-only'] as const)for(const mode of ['strict','report'] as const){
  const author=declareCoreFacets(postgresqlFacetIdeal(seed.family),{module:'m',element:'value'},seed.facets);
  rows.push({name:seed.name,author,request:{id:'native',namespace:'facet_projection',tableName:'case_'+rows.length,columnName:'value',nativeType:seed.type,mode,encoding,obligation:'value-domain'}});
 }
 for(const type of ['real','double precision','numeric','integer'] as const)for(const obligation of ['value-domain','exact-input'] as const)for(const mode of ['strict','report'] as const){
  const author=declareCoreElementKind(postgresqlFacetIdeal(type==='numeric'?'decimal':type==='integer'?'integer':'float'),{module:'m',element:'value'},'field');
  rows.push({name:'facetless-'+type,author,request:{id:'native',namespace:'facet_projection',tableName:'case_'+rows.length,columnName:'value',nativeType:type,mode,encoding:'checked',obligation}});
 }
 return rows;
}
