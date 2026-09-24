import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importDbtManifest,exportDbtManifest,inspectDbtManifest,getDbtManifestNode,proposeDbtManifestNodeEdit,readDocument,writeDocument,DBT_MANIFEST_EXTENSION} from '../../src';
const base='fixtures/dbt/',raw=await Bun.file(base+'manifest.json').text(),editPath='/nodes/model.umf_fixture.order_totals/description';
test('US-022-AC1/3: native-generated manifest round trips and description edits preserve resources',async()=>{
 const d=importDbtManifest(raw,{id:'dbt-fixture'}),report=await Bun.file(base+'oracle-results.json').json();expect(createHash('sha256').update(raw).digest('hex')).toBe(report.sourceSha256);expect(report.buildResults).toBe(6);expect(report.macros).toBe(429);expect(inspectDbtManifest(d).diagnostics.some(d=>d.code==='DBT_MANIFEST_NATIVE_SCHEMA')).toBe(false);
 const edit=proposeDbtManifestNodeEdit(d,editPath,JSON.stringify('Reviewed synthetic customer totals.'));for(const f of ['json','yaml'] as const){expect(exportDbtManifest(readDocument(writeDocument(d,f),f))).toBe(await Bun.file(base+'roundtrip.'+f+'.json').text());expect(exportDbtManifest(readDocument(writeDocument(edit.document,f),f))).toBe(await Bun.file(base+'edited.'+f+'.json').text());expect(report.results.find((r:any)=>r.format===f).nativeParserEqual).toBe(true);}
 expect(getDbtManifestNode(d,editPath)).not.toEqual(getDbtManifestNode(edit.document,editPath));
});
test('US-022-AC2: exact future content, invalid native shapes and atomic edit boundaries',()=>{
 const future=importDbtManifest('{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/manifest/v99.json"},"future":9007199254740993}',{id:'future'});expect(exportDbtManifest(future)).toContain('9007199254740993');expect(inspectDbtManifest(future).diagnostics.some(d=>d.code==='DBT_MANIFEST_VERSION')).toBe(true);
 const malformed=importDbtManifest('{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/manifest/v12.json"}}',{id:'incomplete'});expect(inspectDbtManifest(malformed).diagnostics.some(d=>d.code==='DBT_MANIFEST_NATIVE_SCHEMA')).toBe(true);
 const d=importDbtManifest(raw,{id:'atomic'}),before=exportDbtManifest(d),node=getDbtManifestNode(d,editPath);if(node.kind==='string')node.value='mutated';expect(exportDbtManifest(d)).toBe(before);expect(()=>proposeDbtManifestNodeEdit(d,'/metadata/dbt_schema_version','false')).toThrow();expect(()=>proposeDbtManifestNodeEdit(d,'/missing','null')).toThrow();expect(exportDbtManifest(d)).toBe(before);
 (future.modules[0]!.elements[0]!.extensions[DBT_MANIFEST_EXTENSION] as any).futureRepresentation=true;expect(()=>exportDbtManifest(future)).toThrow();expect(readDocument(writeDocument(future,'yaml'),'yaml')).toEqual(future);expect(()=>importDbtManifest('[]',{id:'bad'})).toThrow();
});
test('US-022-AC3: native schema and build evidence remain bound to captured inputs',async()=>{
 const provenance=await Bun.file(base+'provenance.json').json();expect(provenance.runtime['dbt-core']).toBe('1.10.0');expect(provenance.runtime['dbt-duckdb']).toBe('1.9.3');
 for(const file of provenance.files)expect(createHash('sha256').update(await Bun.file(file.path).bytes()).digest('hex')).toBe(file.sha256);
 const pinned=await Bun.file('native/dbt/sources/manifest.json').json();for(const file of pinned.files)expect(createHash('sha256').update(await Bun.file(file.path).bytes()).digest('hex')).toBe(file.sha256);
 expect(await Bun.file('spec/extensions/dbt-manifest/native-schema.json').text()).toBe(await Bun.file('native/dbt/sources/manifest-v12.json').text());
});
