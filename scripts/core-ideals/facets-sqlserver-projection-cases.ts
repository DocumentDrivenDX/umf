import {declareCoreFacets,declareCoreElementKind,type Document,type CoreFacetPatch,type CoreFacetDeclaration,type CoreKindDeclaration} from '../../src';
import type {FacetsSqlServerRequest} from '../../src/core-ideals/facets-sqlserver-projection';
export const sqlserverFacetIdeal=(scalarType:string):Document=>({umf:'0.5.0',id:'ideal',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'value',name:'value',kind:'field',scalarType,extensions:{}}]}]});
export function facetsSqlServerProjectionCases(){
 const seeds:{name:string;family:string;type:FacetsSqlServerRequest['nativeType'];facets:CoreFacetPatch}[]=[
  ...[0,2,4001,2147483648].flatMap(max=>(['nvarchar','varchar','nchar'] as const).map(type=>({name:`length-${type}-${max}`,family:'string',type,facets:{length:{max,unit:'unicode-scalar' as const}}}))),
  ...[0,2,8001,2147483648].flatMap(max=>(['varbinary','binary'] as const).map(type=>({name:`bytes-${type}-${max}`,family:'binary',type,facets:{length:{max,unit:'byte' as const}}}))),
  ...[{bits:8,signed:true},{bits:8,signed:false},{bits:16,signed:true},{bits:16,signed:false}].flatMap(integerWidth=>(['tinyint','smallint'] as const).map(type=>({name:`${type}-${integerWidth.bits}-${integerWidth.signed}`,family:'integer',type,facets:{integerWidth}}))),
  ...[64,126,127,128].map(bits=>({name:'decimal-integer-'+bits,family:'integer',type:'decimal' as const,facets:{integerWidth:{bits,signed:true}}})),
  ...[{precision:5,scale:2},{precision:3,scale:3},{precision:38,scale:0},{precision:38,scale:38},{precision:39,scale:0}].map(facets=>({name:`decimal-${facets.precision}-${facets.scale}`,family:'decimal',type:'decimal' as const,facets})),
 ];
 const rows:{name:string;author:CoreFacetDeclaration|CoreKindDeclaration;request:FacetsSqlServerRequest}[]=[];
 for(const seed of seeds)for(const encoding of ['checked','type-modifier','carrier-only'] as const)for(const mode of ['strict','report'] as const){const author=declareCoreFacets(sqlserverFacetIdeal(seed.family),{module:'m',element:'value'},seed.facets);rows.push({name:seed.name,author,request:{id:'native',namespace:'facet_projection',tableName:'case_'+rows.length,columnName:'value',nativeType:seed.type,mode,encoding,obligation:'value-domain'}});}
 for(const type of ['real','float(53)','decimal','int'] as const)for(const obligation of ['value-domain','exact-input'] as const)for(const mode of ['strict','report'] as const){const author=declareCoreElementKind(sqlserverFacetIdeal(type==='decimal'?'decimal':type==='int'?'integer':'float'),{module:'m',element:'value'},'field');rows.push({name:'facetless-'+type,author,request:{id:'native',namespace:'facet_projection',tableName:'case_'+rows.length,columnName:'value',nativeType:type,mode,encoding:'checked',obligation}});}
 const control=rows.find(r=>r.name==='smallint-8-true'&&r.request.encoding==='checked'&&r.request.mode==='report')!;
 const source=sqlserverFacetIdeal('integer');source.modules[0]!.elements[0]!.description="Owner's note;\nUnicode 😀";
 control.author=declareCoreFacets(source,{module:'m',element:'value'},{integerWidth:{bits:8,signed:true}});control.request.tableName+='] quote';
 return rows;
}
