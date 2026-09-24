import {createHash} from 'node:crypto';
import {importDbtManifest,exportDbtManifest,inspectDbtManifest,proposeDbtManifestNodeEdit,writeDocument,readDocument} from '../src';
const base='fixtures/dbt/rich/',raw=await Bun.file(base+'manifest.json').text(),d=importDbtManifest(raw,{id:'dbt-rich'}),view=JSON.parse(raw),edits=[];
for(const f of ['json','yaml'] as const)await Bun.write(base+'roundtrip.'+f+'.json',exportDbtManifest(readDocument(writeDocument(d,f),f)));
const paths=[
 '/nodes/model.umf_fixture.order_totals/description','/nodes/snapshot.umf_fixture.order_history/description','/nodes/analysis.umf_fixture.order_audit/description',
 '/sources/source.umf_fixture.seed_alias.orders/description','/exposures/exposure.umf_fixture.totals_dashboard/description','/metrics/metric.umf_fixture.total_amount/description',
 '/groups/group.umf_fixture.finance/description','/semantic_models/semantic_model.umf_fixture.orders_semantic/description','/saved_queries/saved_query.umf_fixture.daily_totals/description',
 '/unit_tests/unit_test.umf_fixture.order_totals.totals_include_adjustments/description','/macros/macro.umf_fixture.fixture_label/description','/docs/doc.umf_fixture.amount_meaning/block_contents',
 '/disabled/model.umf_fixture.disabled/0/description',
];
for(const [i,path] of paths.entries()){
 const id='edit-'+i,value='Reviewed synthetic metadata '+i,candidate=proposeDbtManifestNodeEdit(d,path,JSON.stringify(value));
 for(const f of ['json','yaml'] as const)await Bun.write(base+id+'.'+f+'.json',exportDbtManifest(readDocument(writeDocument(candidate.document,f),f)));
 edits.push({id,path,value,validation:candidate.validation});
}
await Bun.write(base+'results.json',JSON.stringify({sourceSha256:createHash('sha256').update(raw).digest('hex'),collections:Object.fromEntries(Object.entries(view).filter(([k,v])=>k!=='metadata'&&v&&typeof v==='object').map(([k,v])=>[k,Object.keys(v as object).length])),validation:inspectDbtManifest(d),edits},null,2)+'\n');
