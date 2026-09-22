import assert from 'node:assert/strict';
import {facetTableSpecCases} from './facets-tablespec-cases';
import {classifyTableSpecFacets,copyJson,writeJsonValue,readJsonValue,recoverTableSpecFacetSource,type TableSpecFacetClassification} from '../../src';
const rows=[];let recoveries=0;
for(const row of facetTableSpecCases()){
 const r=classifyTableSpecFacets(row.source,row.request),recovered=[];
 if(r.status==='classified')for(const format of ['json','yaml'] as const){const receipt=readJsonValue(writeJsonValue(copyJson(r),format),format) as unknown as TableSpecFacetClassification;const text=recoverTableSpecFacetSource(receipt,receipt.target!);assert.equal(text,row.text);recovered.push({format,text});recoveries++;}
 rows.push({case:row.name,nativeFormat:row.nativeFormat,sourceText:row.text,request:row.request,status:r.status,outcome:r.outcome,mapping:r.mapping,residuals:r.residuals,recovered});
}
await Bun.write('fixtures/validation/facets-tablespec-classification.json',JSON.stringify({scope:'Experimental native facet classification and retained native recovery; down-projection and full binding acceptance pending',rows},null,2)+'\n');
console.log(JSON.stringify({cases:rows.length,classified:rows.filter(r=>r.status==='classified').length,recoveries}));
