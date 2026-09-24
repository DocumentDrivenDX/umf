import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importDbtArtifact,exportDbtArtifact,inspectDbtArtifact,proposeDbtArtifactNodeEdit,readDocument,writeDocument,DBT_ARTIFACT_EXTENSION} from '../../src';
const base='fixtures/dbt/artifacts/',sha=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
test('US-022-AC7: native run results/catalog preserve complete content through both formats and edits',async()=>{
 const cases=(await Bun.file(base+'results.json').json()).results,native=await Bun.file(base+'oracle-results.json').json();expect(cases).toHaveLength(4);expect(native.results).toHaveLength(8);
 for(const c of cases){const raw=await Bun.file(c.path).text(),d=importDbtArtifact(raw,{id:c.id}),before=exportDbtArtifact(d);expect(sha(raw)).toBe(c.sourceSha256);expect(inspectDbtArtifact(d).diagnostics.some(x=>x.code==='DBT_ARTIFACT_NATIVE_SCHEMA')).toBe(false);const candidate=proposeDbtArtifactNodeEdit(d,c.editPath,JSON.stringify(c.value));for(const f of ['json','yaml'] as const){const r=native.results.find((x:any)=>x.id===c.id&&x.format===f);expect(sha(exportDbtArtifact(readDocument(writeDocument(d,f),f)))).toBe(r.roundtripSha256);expect(sha(exportDbtArtifact(readDocument(writeDocument(candidate.document,f),f)))).toBe(r.editedSha256);}expect(exportDbtArtifact(d)).toBe(before);}
});
test('US-022-AC7: observed catalog types remain separate from declarations and pinned source schemas',async()=>{
 const report=await Bun.file(base+'oracle-results.json').json();expect(report.declaredVsObserved).toMatchObject({declared:'decimal(18,2)',observed:'DOUBLE',equivalenceClaimed:false});const m=await Bun.file(base+'catalog-manifest.json').json(),c=await Bun.file(base+'catalog.json').json();expect(m.nodes['model.umf_fixture.order_totals'].columns.total_amount.data_type).toBe('decimal(18,2)');expect(c.nodes['model.umf_fixture.order_totals'].columns.total_amount.type).toBe('DOUBLE');
 const p=await Bun.file(base+'provenance.json').json();for(const f of p.files)expect(sha(await Bun.file(f.path).bytes())).toBe(f.sha256);
 for(const name of ['catalog-v1','run-results-v6'])expect(await Bun.file('spec/extensions/dbt-artifact/'+name+'-schema.json').text()).toBe(await Bun.file('native/dbt/sources/'+name+'.json').text());
});
test('US-022-AC7: future numbers, invalid native shapes and representation boundaries remain explicit',()=>{
 const d=importDbtArtifact('{"metadata":{"dbt_schema_version":"future"},"rows":9007199254740993}',{id:'future'});expect(exportDbtArtifact(d)).toContain('9007199254740993');expect(inspectDbtArtifact(d).diagnostics.some(x=>x.code==='DBT_ARTIFACT_VERSION')).toBe(true);const original=exportDbtArtifact(d);expect(()=>proposeDbtArtifactNodeEdit(d,'/metadata','false')).toThrow();expect(exportDbtArtifact(d)).toBe(original);
 (d.modules[0]!.elements[0]!.extensions[DBT_ARTIFACT_EXTENSION] as any).unknownRepresentation=true;expect(()=>exportDbtArtifact(d)).toThrow();expect(readDocument(writeDocument(d,'yaml'),'yaml')).toEqual(d);
 const malformed=importDbtArtifact('{"metadata":{"dbt_schema_version":"https://schemas.getdbt.com/dbt/run-results/v6.json"}}',{id:'partial'});expect(inspectDbtArtifact(malformed).diagnostics.some(x=>x.code==='DBT_ARTIFACT_NATIVE_SCHEMA')).toBe(true);expect(()=>importDbtArtifact('[]',{id:'bad'})).toThrow();
});
