import {createHash} from 'node:crypto';
import {importDbtSemanticManifest,exportDbtSemanticManifest,proposeDbtSemanticManifestNodeEdit,writeDocument,readDocument} from '../src';
const base='fixtures/dbt/semantic-metrics/',raw=await Bun.file(base+'semantic-manifest.json').text(),source=JSON.parse(raw),d=importDbtSemanticManifest(raw,{id:'metric-types'}),results=[];
const metric=(name:string)=>{const i=source.metrics.findIndex((m:any)=>m.name===name);if(i<0)throw Error(name);return '/metrics/'+i;};
const cases:[string,string,unknown,boolean,boolean,boolean][]=[
 ['measure-average','/semantic_models/0/measures/0/agg','average',true,true,true],
 ['ratio-alias',metric('amount_per_order')+'/type_params/numerator/alias','numerator_amount',true,true,true],
 ['derived-offset',metric('amount_change')+'/type_params/metrics/1/offset_window/count',2,true,true,true],
 ['rolling-window',metric('rolling_amount')+'/type_params/cumulative_type_params/window/count',14,true,true,true],
 ['period-aggregation',metric('monthly_amount')+'/type_params/cumulative_type_params/period_agg','first',true,true,true],
 ['conversion-calculation',metric('order_conversion')+'/type_params/conversion_type_params/calculation','conversions',true,true,true],
 ['conflicting-window',metric('rolling_amount')+'/type_params/cumulative_type_params/grain_to_date','month',true,true,false],
 ['missing-input-metric',metric('amount_change')+'/type_params/metrics/0/name','missing_metric',true,true,false],
 ['missing-conversion-entity',metric('order_conversion')+'/type_params/conversion_type_params/entity','missing_entity',true,true,false],
 ['unknown-aggregation','/semantic_models/0/measures/0/agg','unknown_aggregation',false,false,false],
 ['null-metrics','/metrics',null,false,false,false],
];
for(const f of ['json','yaml'] as const)await Bun.write(base+'source.'+f+'.json',exportDbtSemanticManifest(readDocument(writeDocument(d,f),f)));
for(const [id,editPath,value,shapeValid,parserValid,semanticValid] of cases){
 const candidate=proposeDbtSemanticManifestNodeEdit(d,editPath,JSON.stringify(value));
 const shape=!candidate.validation.diagnostics.some(x=>x.code==='DBT_SEMANTIC_MANIFEST_NATIVE_SCHEMA');if(shape!==shapeValid)throw Error(id+' shape differs');
 for(const f of ['json','yaml'] as const)await Bun.write(base+id+'.edited.'+f+'.json',exportDbtSemanticManifest(readDocument(writeDocument(candidate.document,f),f)));
 results.push({id,editPath,value,shapeValid,parserValid,semanticValid,validation:candidate.validation});
}
await Bun.write(base+'results.json',JSON.stringify({sourceSha256:createHash('sha256').update(raw).digest('hex'),results},null,2)+'\n');
