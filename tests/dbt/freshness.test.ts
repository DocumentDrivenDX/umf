import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importDbtArtifact,exportDbtArtifact,inspectDbtArtifact,proposeDbtArtifactNodeEdit,readDocument,writeDocument} from '../../src';
const base='fixtures/dbt/freshness/',sha=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
test('US-022-AC8: emitted and runner artifacts retain distinct outcomes and native diagnostic edits',async()=>{
 const cases=(await Bun.file(base+'results.json').json()).results,native=await Bun.file(base+'oracle-results.json').json();
 for(const c of cases){const raw=await Bun.file(base+c.id+'.json').text(),d=importDbtArtifact(raw,{id:c.id}),before=exportDbtArtifact(d),edit=proposeDbtArtifactNodeEdit(d,c.path,JSON.stringify(c.value));expect(sha(raw)).toBe(c.sourceSha256);expect(inspectDbtArtifact(d).diagnostics.some(x=>x.code==='DBT_ARTIFACT_NATIVE_SCHEMA')).toBe(false);for(const f of ['json','yaml'] as const){const n=native.results.find((n:any)=>n.id===c.id&&n.format===f);expect(sha(exportDbtArtifact(readDocument(writeDocument(d,f),f)))).toBe(n.roundtripSha256);expect(sha(exportDbtArtifact(readDocument(writeDocument(edit.document,f),f)))).toBe(n.editedSha256);}expect(exportDbtArtifact(d)).toBe(before);}
});
test('US-022-AC8: native emitter omission cannot be mistaken for a successful source',async()=>{
 const emitted=await Bun.file(base+'sources.json').json(),runner=await Bun.file(base+'runner-results.json').json(),provenance=await Bun.file(base+'provenance.json').json();expect(emitted.results).toHaveLength(3);expect(runner.results).toHaveLength(4);expect(new Set(runner.results.map((r:any)=>r.status))).toEqual(new Set(['pass','warn','error','runtime error']));expect(provenance.omittedByNativeEmitter).toEqual(['source.umf_freshness.synthetic.broken']);
 const broken=runner.results.find((r:any)=>r.status==='runtime error');expect(broken.error).toContain('umf_missing_fixture_function');expect(broken.max_loaded_at_time_ago_in_s).toBeUndefined();
 for(const [name,age,status] of [['recent',300,'pass'],['stale',7200,'warn'],['expired',14400,'error']] as const){const row=emitted.results.find((r:any)=>r.unique_id.endsWith('.'+name));expect(row.status).toBe(status);expect(row.max_loaded_at_time_ago_in_s).toBeCloseTo(age,0);expect(row.adapter_response._message).toBe('OK');}
 for(const file of provenance.files)expect(sha(await Bun.file(file.path).bytes())).toBe(file.sha256);
 expect(await Bun.file('spec/extensions/dbt-artifact/sources-v3-schema.json').text()).toBe(await Bun.file('native/dbt/sources/sources-v3.json').text());
});
