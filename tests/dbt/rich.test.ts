import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importDbtManifest,exportDbtManifest,inspectDbtManifest,proposeDbtManifestNodeEdit,writeDocument,readDocument} from '../../src';
const base='fixtures/dbt/rich/',sha=(b:string|Uint8Array)=>createHash('sha256').update(b).digest('hex');
test('US-022-AC4: richer native build retains resource collections and distinguishes no-op outcomes',async()=>{
 const source=await Bun.file(base+'manifest.json').json(),r=await Bun.file(base+'oracle-results.json').json(),provenance=await Bun.file(base+'provenance.json').json();
 expect(r.buildStatuses).toEqual({success:6,pass:5,'no-op':2});expect(Object.keys(source.nodes)).toHaveLength(11);expect(Object.keys(source.macros)).toHaveLength(430);
 for(const key of ['sources','docs','exposures','metrics','groups','selectors','disabled','parent_map','child_map','group_map','saved_queries','semantic_models','unit_tests'])expect(Object.keys(source[key]).length).toBeGreaterThan(0);
 const kinds=new Set(Object.values(source.nodes).map((n:any)=>n.resource_type));for(const kind of ['model','snapshot','analysis','seed','operation','test'])expect(kinds.has(kind)).toBe(true);
 for(const f of provenance.files)expect(sha(await Bun.file(f.path).bytes())).toBe(f.sha256);
});
test('US-022-AC4: 13 resource edits match independently checked outputs through both formats',async()=>{
 const raw=await Bun.file(base+'manifest.json').text(),d=importDbtManifest(raw,{id:'dbt-rich'}),before=exportDbtManifest(d),report=await Bun.file(base+'results.json').json(),native=await Bun.file(base+'oracle-results.json').json();expect(sha(raw)).toBe(native.sourceSha256);expect(inspectDbtManifest(d).diagnostics.some(x=>x.code==='DBT_MANIFEST_NATIVE_SCHEMA')).toBe(false);expect(report.edits).toHaveLength(13);expect(native.results).toHaveLength(26);
 for(const edit of report.edits){const candidate=proposeDbtManifestNodeEdit(d,edit.path,JSON.stringify(edit.value));for(const f of ['json','yaml'] as const){const output=exportDbtManifest(readDocument(writeDocument(candidate.document,f),f)),evidence=native.results.find((r:any)=>r.id===edit.id&&r.format===f);expect(evidence.nativeSchemaValid&&evidence.nativeParserEqual&&evidence.onlyRequestedValueChanged).toBe(true);expect(sha(output)).toBe(evidence.sha256);}}
 expect(exportDbtManifest(d)).toBe(before);
},30000);
