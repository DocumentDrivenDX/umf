import {declareCoreFacets,declareCoreElementKind,type Document,type CoreFacetPatch,type FacetsTableSpecRequest,type CoreFacetDeclaration,type CoreKindDeclaration} from '../../src';
export const facetProjectionSource=(scalarType:string):Document=>({umf:'0.5.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'value',name:'value',kind:'field',scalarType,extensions:{}}]}]});
export function facetsTableSpecProjectionCases(){
 const seeds:{name:string;family:string;type:FacetsTableSpecRequest['nativeType'];facets:CoreFacetPatch}[]=[
  ...[0,2,200].map(max=>({name:'length-'+max,family:'string',type:'VARCHAR' as const,facets:{length:{max,unit:'unicode-scalar' as const}}})),
  {name:'byte-length',family:'binary',type:'TEXT',facets:{length:{max:2,unit:'byte'}}},
  ...[{bits:1,signed:true},{bits:1,signed:false},{bits:8,signed:true},{bits:8,signed:false},{bits:31,signed:false},{bits:32,signed:true},{bits:32,signed:false},{bits:64,signed:true},{bits:Number.MAX_SAFE_INTEGER,signed:true}].map(integerWidth=>({name:'width-'+integerWidth.bits+'-'+integerWidth.signed,family:'integer',type:'INTEGER' as const,facets:{integerWidth}})),
  ...[{precision:5,scale:0},{precision:10,scale:0},{precision:5,scale:2},{precision:38,scale:2},{precision:39,scale:2}].map(facets=>({name:'decimal-'+facets.precision+'-'+facets.scale,family:'decimal',type:'DECIMAL' as const,facets})),
 ];
 const rows:{name:string;author:CoreFacetDeclaration|CoreKindDeclaration;request:FacetsTableSpecRequest}[]=[];
 for(const seed of seeds)for(const profile of ['declared-metadata','json-schema','pyspark-schema','gx-spark','gx-suite-spark','ingest-cast','unresolved'] as const)for(const input of ['raw','model-normalized'] as const)for(const mode of ['strict','report'] as const){
  const author=declareCoreFacets(facetProjectionSource(seed.family),{module:'m',element:'value'},seed.facets);
  rows.push({name:seed.name,author,request:{id:'native',tableName:'Facets',columnName:'value',nativeType:seed.type,mode,profile,input,obligation:'value-domain'}});
 }
 for(const family of ['float','decimal','integer'])for(const profile of ['pyspark-schema','gx-suite-spark','ingest-cast'] as const)for(const obligation of ['value-domain','exact-input'] as const)for(const mode of ['strict','report'] as const){
  const author=declareCoreElementKind(facetProjectionSource(family),{module:'m',element:'value'},'field');
  rows.push({name:'facetless-'+family,author,request:{id:'native',tableName:'Facets',columnName:'value',nativeType:family==='float'?'FLOAT':family==='decimal'?'DECIMAL':'INTEGER',mode,profile,input:'raw',obligation}});
 }
 return rows;
}
