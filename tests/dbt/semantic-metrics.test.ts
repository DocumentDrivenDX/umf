import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importDbtSemanticManifest,exportDbtSemanticManifest,proposeDbtSemanticManifestNodeEdit,writeDocument,readDocument} from '../../src';
const base='fixtures/dbt/semantic-metrics/',sha=(s:string|Uint8Array)=>createHash('sha256').update(s).digest('hex');
test('US-022-AC11: all pinned native metric types and parameter candidates retain source meaning',async()=>{
 const raw=await Bun.file(base+'semantic-manifest.json').text(),source=JSON.parse(raw),d=importDbtSemanticManifest(raw,{id:'metrics'}),cases=await Bun.file(base+'results.json').json(),oracle=await Bun.file(base+'oracle-results.json').json();
 expect(sha(raw)).toBe(cases.sourceSha256);expect([...new Set(source.metrics.map((m:any)=>m.type))].sort()).toEqual(oracle.metricTypes);expect(oracle.metricTypes).toEqual(['conversion','cumulative','derived','ratio','simple']);expect(source.metrics).toHaveLength(7);expect(cases.results).toHaveLength(11);expect(oracle.results).toHaveLength(22);
 for(const f of ['json','yaml'] as const)expect(sha(exportDbtSemanticManifest(readDocument(writeDocument(d,f),f)))).toBe(oracle.sources.find((x:any)=>x.format===f).sha256);
 const before=exportDbtSemanticManifest(d);
 for(const c of cases.results){const candidate=proposeDbtSemanticManifestNodeEdit(d,c.editPath,JSON.stringify(c.value));expect(!candidate.validation.diagnostics.some(x=>x.code==='DBT_SEMANTIC_MANIFEST_NATIVE_SCHEMA')).toBe(c.shapeValid);expect(candidate.validation.complete).toBe(false);
  for(const f of ['json','yaml'] as const){const r=oracle.results.find((r:any)=>r.id===c.id&&r.format===f);expect(sha(exportDbtSemanticManifest(readDocument(writeDocument(candidate.document,f),f)))).toBe(r.sha256);expect(r.parserValid).toBe(c.parserValid);expect(r.semanticValid).toBe(c.semanticValid);}
 }
 expect(exportDbtSemanticManifest(d)).toBe(before);
});
test('US-022-AC11: shape acceptance does not mask native semantic rejection',async()=>{
 const oracle=await Bun.file(base+'oracle-results.json').json();const rows=oracle.results.filter((x:any)=>x.format==='json');
 expect(rows.filter((x:any)=>x.semanticValid)).toHaveLength(6);
 expect(rows.filter((x:any)=>x.shapeValid&&!x.semanticValid).map((x:any)=>x.id)).toEqual(['conflicting-window','missing-input-metric','missing-conversion-entity']);
 for(const r of rows.filter((x:any)=>!x.semanticValid))expect(r.errors.length).toBeGreaterThan(0);
 expect(rows.filter((x:any)=>!x.parserValid).map((x:any)=>x.id)).toEqual(['unknown-aggregation','null-metrics']);
 const p=await Bun.file(base+'provenance.json').json();expect(p.exitCode).toBe(0);for(const f of p.files)expect(sha(await Bun.file(f.path).bytes())).toBe(f.sha256);
});
