import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importDbtArtifact,exportDbtArtifact,proposeDbtArtifactNodeEdit,readDocument,writeDocument} from '../../src';
const base='fixtures/dbt/failure/';
test('US-022-AC9: native errors, failed tests and skipped dependents retain distinct meanings',async()=>{
 const raw=await Bun.file(base+'run-results.json').text(),artifact=JSON.parse(raw),manifest=await Bun.file(base+'manifest.json').json(),p=await Bun.file(base+'provenance.json').json();
 expect(p.exitCode).toBe(1);expect(artifact.metadata.invocation_id).toBe(manifest.metadata.invocation_id);
 const rows=Object.fromEntries(artifact.results.map((r:any)=>[r.unique_id,r])) as Record<string,any>;
 expect(Object.fromEntries(artifact.results.map((r:any)=>[r.unique_id,r.status]))).toEqual({
  'model.umf_failure.broken':'error','model.umf_failure.gated_parent':'success','model.umf_failure.healthy':'success',
  'model.umf_failure.after_broken':'skipped','model.umf_failure.after_gate':'skipped',
  'test.umf_failure.assert_failure':'fail','test.umf_failure.assert_warning':'warn','test.umf_failure.assert_pass':'pass',
 });
 for(const [id,count] of [['assert_failure',1],['assert_warning',1],['assert_pass',0]] as const){const r=rows['test.umf_failure.'+id];expect(r.failures).toBe(count);expect(r.adapter_response).toEqual({_message:'OK'});}
 for(const id of ['after_broken','after_gate']){const r=rows['model.umf_failure.'+id];expect(r.timing).toEqual([]);expect(r.adapter_response).toEqual({});expect(r.failures).toBeNull();}
 expect(rows['model.umf_failure.broken'].message).toContain('umf_missing_fixture_function');
 expect(manifest.nodes['model.umf_failure.after_broken'].depends_on.nodes).toEqual(['model.umf_failure.broken']);
 expect(manifest.nodes['model.umf_failure.after_gate'].depends_on.nodes).toEqual(['model.umf_failure.gated_parent']);
 expect(manifest.nodes['test.umf_failure.assert_failure'].depends_on.nodes).toEqual(['model.umf_failure.gated_parent']);
 const d=importDbtArtifact(raw,{id:'failed-build'}),i=artifact.results.findIndex((r:any)=>r.status==='fail');
 const candidate=proposeDbtArtifactNodeEdit(d,`/results/${i}/message`,JSON.stringify('Reviewed test diagnostic.'));
 const expected=structuredClone(artifact);expected.results[i].message='Reviewed test diagnostic.';
 for(const format of ['json','yaml'] as const){expect(JSON.parse(exportDbtArtifact(readDocument(writeDocument(d,format),format)))).toEqual(artifact);expect(JSON.parse(exportDbtArtifact(readDocument(writeDocument(candidate.document,format),format)))).toEqual(expected);}
 expect(JSON.parse(exportDbtArtifact(d))).toEqual(artifact);
 for(const f of p.files)expect(createHash('sha256').update(await Bun.file(f.path).bytes()).digest('hex')).toBe(f.sha256);
});
