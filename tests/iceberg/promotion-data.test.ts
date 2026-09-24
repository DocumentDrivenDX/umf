import {test,expect} from 'bun:test';
import {createHash} from 'node:crypto';
import {importIcebergTable,exportIcebergTable,proposeIcebergTablePromotion,readDocument,writeDocument} from '../../src';
const base='fixtures/iceberg/table-promotion/',sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
test('US-021-AC9: data evidence binds exact files and metadata to current public candidates',async()=>{
 const manifest=await Bun.file(base+'data/manifest.json').json(),native=await Bun.file(base+'data/java-results.json').json(),cases=(await Bun.file(base+'results.json').json()).results;
 expect(manifest.writer).toBe('PyArrow 21.0.0');expect(manifest.cases).toHaveLength(6);expect(native.results).toHaveLength(6);expect(manifest.cases.reduce((n:number,c:any)=>n+c.rows,0)).toBe(45);
 for(const c of manifest.cases){
  const result=native.results.find((r:any)=>r.id===c.id),m=cases.find((m:any)=>m.id===c.id),sourceBytes=await Bun.file(m.path).bytes(),source=importIcebergTable(new TextDecoder().decode(sourceBytes),{id:c.id}),candidate=proposeIcebergTablePromotion(source,m);
  expect(sha(await Bun.file(c.path).bytes())).toBe(c.sha256);expect(result.fileSha256).toBe(c.sha256);expect(result.metadataSha256.source).toBe(sha(sourceBytes));expect(result.rows).toBe(c.rows);expect(result.sourceRead).toBe(true);expect(result.promotedFormatReads).toBe(2);expect(result.physicalNamesDiffer).toBe(true);expect(c.rowGroups).toBeGreaterThan(1);
  for(const f of ['json','yaml'] as const){const bytes=await Bun.file(base+c.id+'.'+f+'.json').bytes();expect(result.metadataSha256[f]).toBe(sha(bytes));expect(exportIcebergTable(readDocument(writeDocument(candidate.document,f),f))).toBe(new TextDecoder().decode(bytes));}
 }
 const float=manifest.cases.find((c:any)=>c.sourceType==='float');expect(float.expectedPromoted).toContain('8000000000000000');expect(float.expectedPromoted).toContain('7ff0000000000000');expect(float.expectedPromoted).toContain('fff0000000000000');expect(float.expectedPromoted).toContain('7ff8000000000000');
});
