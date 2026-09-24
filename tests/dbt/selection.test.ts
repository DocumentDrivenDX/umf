import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importDbtManifest,exportDbtManifest,selectDbtManifestDependencies,proposeDbtManifestNodeEdit} from '../../src';
import {createValidator} from '../../src/validation/schema';
import core from '../../spec/core/schema.json';
import schema from '../../spec/extensions/dbt-manifest/selection-schema.json';
const ajv=createValidator();ajv.addSchema(core);const valid=ajv.compile(schema),base='fixtures/dbt/rich/',raw=await Bun.file(base+'manifest.json').text();
test('US-022-AC6: bounded context matches independent reachability with full source recovery',async()=>{
 const d=importDbtManifest(raw,{id:'selection'}),before=exportDbtManifest(d),cases=await Bun.file(base+'selection-results.json').json(),native=await Bun.file(base+'selection-oracle-results.json').json();expect(createHash('sha256').update(raw).digest('hex')).toBe(native.sourceSha256);expect(createHash('sha256').update(await Bun.file(base+'selection-results.json').bytes()).digest('hex')).toBe(native.selectionSha256);
 for(const c of cases.results){const r=selectDbtManifestDependencies(d,c.options);expect(valid(r)).toBe(true);expect(r.selection).toEqual(c.selection);expect(exportDbtManifest(r.source)).toBe(before);expect(r.source).not.toBe(d);expect(native.results.find((x:any)=>x.id===c.id).minimumDepthsAgree).toBe(true);r.source.id='changed';expect(d.id).toBe('selection');}
 expect(cases.results.find((x:any)=>x.id==='semantic-chain').selection.nodes.map((n:any)=>n.id)).toEqual(['saved_query.umf_fixture.daily_totals','metric.umf_fixture.total_amount','semantic_model.umf_fixture.orders_semantic','model.umf_fixture.order_events','seed.umf_fixture.orders']);
});
test('US-022-AC6: roots, zero depth, limits and cycles do not silently omit context',()=>{
 const d=importDbtManifest(raw,{id:'boundaries'}),root='model.umf_fixture.order_totals';
 const zero=selectDbtManifestDependencies(d,{roots:[root,root],maxDepth:0});expect(zero.selection.roots).toEqual([root]);expect(zero.selection.nodes).toHaveLength(1);expect(zero.selection.boundary[0]!.reason).toBe('depth-limit');
 expect(selectDbtManifestDependencies(d,{roots:['missing']}).selection.status).toBe('blocked');expect(selectDbtManifestDependencies(d,{roots:[root,'seed.umf_fixture.orders'],maxNodes:1}).selection.status).toBe('blocked');
 for(const options of [{roots:[]},{roots:[root],maxDepth:-1},{roots:[root],maxNodes:0},{roots:[root],includeMacros:null},{roots:[root],maxDepth:null}])expect(()=>selectDbtManifestDependencies(d,options as any)).toThrow();
 const id='macro.umf_fixture.fixture_label',cycle=proposeDbtManifestNodeEdit(d,'/macros/'+id+'/depends_on/macros',JSON.stringify([id,id])).document,r=selectDbtManifestDependencies(cycle,{roots:[id],includeMacros:true});expect(r.selection.status).toBe('selected');expect(r.selection.nodes).toHaveLength(1);expect(r.selection.edges).toHaveLength(2);expect(r.selection.complete).toBe(false);
});
