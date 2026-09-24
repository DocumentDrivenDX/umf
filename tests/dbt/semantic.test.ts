import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importDbtSemanticManifest,exportDbtSemanticManifest,inspectDbtSemanticManifest,proposeDbtSemanticManifestNodeEdit,readDocument,writeDocument,DBT_SEMANTIC_MANIFEST_EXTENSION} from '../../src';
const base='fixtures/dbt/semantic/',sha=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
test('US-022-AC10: semantic manifest source and independent edits match native parser evidence',async()=>{
 const cases=(await Bun.file(base+'results.json').json()).results,native=await Bun.file(base+'oracle-results.json').json();expect(cases).toHaveLength(3);expect(native.results).toHaveLength(6);
 for(const c of cases){const raw=await Bun.file(c.path).text(),d=importDbtSemanticManifest(raw,{id:c.id}),before=exportDbtSemanticManifest(d);expect(sha(raw)).toBe(c.sourceSha256);expect(inspectDbtSemanticManifest(d).diagnostics.some(x=>x.code==='DBT_SEMANTIC_MANIFEST_NATIVE_SCHEMA')).toBe(false);const candidate=proposeDbtSemanticManifestNodeEdit(d,c.editPath,JSON.stringify(c.value));for(const f of ['json','yaml'] as const){const r=native.results.find((x:any)=>x.id===c.id&&x.format===f);expect(sha(exportDbtSemanticManifest(readDocument(writeDocument(d,f),f)))).toBe(r.roundtripSha256);expect(sha(exportDbtSemanticManifest(readDocument(writeDocument(candidate.document,f),f)))).toBe(r.editedSha256);}expect(exportDbtSemanticManifest(d)).toBe(before);}
 const artifact=await Bun.file(base+'semantic-manifest.json').json();expect(artifact.semantic_models[0].entities.map((e:any)=>e.type)).toEqual(['primary','foreign']);expect(artifact.metrics[0].type).toBe('simple');expect(artifact.project_configuration.time_spines).toHaveLength(1);expect(artifact.saved_queries).toHaveLength(1);
});
test('US-022-AC10: schema derivation and native-null discrepancy are explicit and hash-bound',async()=>{
 const native=await Bun.file(base+'oracle-results.json').json();expect(native.rawSchemaErrors).toHaveLength(43);expect(native.derivedSchemaValid).toBe(true);
 for(const path of [base+'provenance.json','native/dbt/semantic-sources/provenance.json']){const p=await Bun.file(path).json();for(const f of p.files)expect(sha(await Bun.file(f.path).bytes())).toBe(f.sha256);}
 expect(await Bun.file('spec/extensions/dbt-semantic/native-schema.json').text()).toBe(await Bun.file('native/dbt/semantic-sources/serialized-schema.json').text());
 const schema=await Bun.file('spec/extensions/dbt-semantic/native-schema.json').json();expect(Object.keys(schema.definitions)).toHaveLength(41);expect((await Bun.file('native/dbt/semantic-sources/nullable-fields.json').json())).toHaveLength(67);
});
test('US-022-AC10: unknown native content survives where the native parser discards it',async()=>{
 const source=await Bun.file(base+'semantic-manifest.json').json();source.future_extension={meaning:'retained by UMF'};source.semantic_models[0].future_attribute=true;
 const d=importDbtSemanticManifest(JSON.stringify(source),{id:'unknown'});
 for(const f of ['json','yaml'] as const)expect(JSON.parse(exportDbtSemanticManifest(readDocument(writeDocument(d,f),f)))).toEqual(source);
 expect((await Bun.file(base+'oracle-results.json').json()).nativeUnknownFieldsDiscarded).toEqual(['/future_extension','/semantic_models/0/future_attribute']);
 const bad=proposeDbtSemanticManifestNodeEdit(d,'/metrics','false');expect(bad.validation.diagnostics.some(x=>x.code==='DBT_SEMANTIC_MANIFEST_NATIVE_SCHEMA')).toBe(true);
 const future=importDbtSemanticManifest('{"project_configuration":{"dsi_package_version":{"major_version":"9","minor_version":"0","patch_version":"0"}},"number":9007199254740993}',{id:'future'});expect(exportDbtSemanticManifest(future)).toContain('9007199254740993');expect(inspectDbtSemanticManifest(future).diagnostics.some(x=>x.code==='DBT_SEMANTIC_MANIFEST_VERSION')).toBe(true);
 expect(()=>proposeDbtSemanticManifestNodeEdit(d,'','[]')).toThrow();expect(JSON.parse(exportDbtSemanticManifest(d))).toEqual(source);
 (d.modules[0]!.elements[0]!.extensions[DBT_SEMANTIC_MANIFEST_EXTENSION] as any).futureRepresentation=true;expect(()=>exportDbtSemanticManifest(d)).toThrow();expect(readDocument(writeDocument(d,'yaml'),'yaml')).toEqual(d);
});
