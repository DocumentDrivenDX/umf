import {projectFacetsToTableSpec,exportTableSpec,recoverFacetsFromTableSpec,copyJson,writeJsonValue,readJsonValue,type FacetsTableSpecProjection} from '../../src';
import {facetsTableSpecProjectionCases} from './facets-tablespec-projection-cases';
const rows=facetsTableSpecProjectionCases().map(row=>{
 const result=projectFacetsToTableSpec(row.author,row.request),nativeText=result.target?exportTableSpec(result.target):null;
 const recoveries=nativeText===null?[]:(['json','yaml'] as const).map(format=>{const receipt=readJsonValue(writeJsonValue(copyJson(result),format),format) as unknown as FacetsTableSpecProjection;return {format,source:recoverFacetsFromTableSpec(receipt,nativeText)};});
 return {name:row.name,author:row.author,request:row.request,status:result.status,mapping:result.mapping,residuals:result.residuals,nativeText,recoveries};
});
await Bun.write('fixtures/validation/facets-tablespec-projection.json',JSON.stringify({scope:'Authored projection and verified source recovery; complete binding qualification pending',rows},null,2)+'\n');
console.log(JSON.stringify({cases:rows.length,projected:rows.filter(r=>r.status==='projected').length,recoveries:rows.reduce((n,r)=>n+r.recoveries.length,0)}));
