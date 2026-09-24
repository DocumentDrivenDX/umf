import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importDbtManifest,exportDbtManifest,inspectDbtManifestGraph,proposeDbtManifestNodeEdit} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/dbt-manifest/graph-schema.json';
const valid=createValidator().compile(schema),raw=await Bun.file('fixtures/dbt/rich/manifest.json').text(),model='model.umf_fixture.order_totals',seed='seed.umf_fixture.orders';
test('US-022-AC5: explicit edges agree with native map builders and remain copied',async()=>{
 for(const base of ['fixtures/dbt/','fixtures/dbt/rich/']){const text=await Bun.file(base+'manifest.json').text(),d=importDbtManifest(text,{id:'g'}),before=exportDbtManifest(d),r=inspectDbtManifestGraph(d),native=await Bun.file(base+'graph-oracle-results.json').json();expect(valid(r)).toBe(true);expect(r.status).toBe('checked');expect(r.complete).toBe(false);expect(createHash('sha256').update(text).digest('hex')).toBe(native.sourceSha256);expect(createHash('sha256').update(await Bun.file(base+'graph-results.json').bytes()).digest('hex')).toBe(native.graphSha256);expect(r.edges.filter(e=>e.kind==='resource')).toHaveLength(native.resourceEdges);expect(r.edges.filter(e=>e.kind==='macro')).toHaveLength(native.macroEdges);expect(r.edges.every(e=>e.resolved)).toBe(true);r.nodes[0]!.id='mutated';expect(exportDbtManifest(d)).toBe(before);}
});
test('US-022-AC5: dangling, wrong-kind and stale redundant maps are explicit without losing source',()=>{
 const source=importDbtManifest(raw,{id:'bad'}),before=exportDbtManifest(source);
 for(const [path,value] of [
  ['/nodes/'+model+'/depends_on/nodes',['missing']],
  ['/nodes/'+model+'/depends_on/nodes',['macro.umf_fixture.fixture_label']],
  ['/parent_map/'+model,[]],
  ['/child_map/'+seed,[]],
  ['/nodes/'+model+'/unique_id','different'],
 ] as const){const edited=proposeDbtManifestNodeEdit(source,path,JSON.stringify(value)).document,text=exportDbtManifest(edited),r=inspectDbtManifestGraph(edited);expect(r.status).toBe('blocked');expect(r.diagnostics.some(d=>d.code==='DBT_MANIFEST_GRAPH')).toBe(true);expect(exportDbtManifest(edited)).toBe(text);}
 expect(exportDbtManifest(source)).toBe(before);
});
test('US-022-AC5: repeated macro references and recursion are retained without a cycle-legality claim',()=>{
 const source=importDbtManifest(raw,{id:'recursive'}),id='macro.umf_fixture.fixture_label',d=proposeDbtManifestNodeEdit(source,'/macros/'+id+'/depends_on/macros',JSON.stringify([id,id])).document,r=inspectDbtManifestGraph(d);
 expect(r.status).toBe('checked');expect(r.complete).toBe(false);expect(r.edges.filter(e=>e.dependent===id&&e.dependency===id)).toHaveLength(2);
 const future=importDbtManifest('{"metadata":{"dbt_schema_version":"future"}}',{id:'future'});expect(inspectDbtManifestGraph(future).status).toBe('blocked');expect(exportDbtManifest(future)).toContain('future');
});
