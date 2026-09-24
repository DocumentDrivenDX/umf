import {test,expect} from 'bun:test';
import {reconcileDeltaMultipartCheckpoint,exportParquetCapture,coreSchema} from '../../src';
import {sparkStringHash} from '../../src/adapters/delta/spark-hash';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/delta-log/multipart.schema.json';
const ajv=createValidator(false);ajv.addSchema(coreSchema);const check=ajv.compile(schema),base='fixtures/delta/multipart/',report=await Bun.file(base+'results.json').json();
test('US-018-AC19: Spark hash vectors include signed UTF-8 tails and explicit seeds',async()=>{for(const v of (await Bun.file(base+'hash-vectors.json').json()).vectors)expect(sparkStringHash(v.value,v.seed)).toBe(v.hash);expect(()=>sparkStringHash('\ud800')).toThrow();});
test('US-018-AC19: native multipart recovery preserves all parts and row origins',()=>{
 for(const e of report.results){const parts=e.parts.map(({name,source}:any)=>({name,source})),r=reconcileDeltaMultipartCheckpoint(e.version,e.partCount,parts,e.sources);expect(r).toEqual(e);expect(check(r)).toBe(true);expect(r.recovery?.state?.version).toBe(e.recovery.state.version);for(const [i,p] of r.parts.entries())expect(exportParquetCapture(p.source)).toEqual(exportParquetCapture(parts[i].source));const reversed=reconcileDeltaMultipartCheckpoint(e.version,e.partCount,[...parts].reverse(),e.sources);expect(reversed.status).toBe('reconciled');expect(reversed.recovery?.state).toEqual(r.recovery?.state);expect(reversed.origins?.every(o=>o.part<parts.length)).toBe(true);}
});
test('US-018-AC19: missing/duplicate parts, mismatched identities and hash-clustering violations block',()=>{
 const e=report.results[0],parts=e.parts.map(({name,source}:any)=>({name,source}));const cases=[reconcileDeltaMultipartCheckpoint(e.version,2,parts.slice(0,1),[]),reconcileDeltaMultipartCheckpoint(e.version,2,[parts[0],parts[0]],[]),reconcileDeltaMultipartCheckpoint('11',2,parts,[]),reconcileDeltaMultipartCheckpoint(e.version,3,parts,[]),reconcileDeltaMultipartCheckpoint(e.version,2,parts.map((p:any,i:number)=>({...p,source:parts[1-i].source})),[])];for(const r of cases){expect(r.status).toBe('blocked');expect(r.recovery?.state).toBeUndefined();expect(check(r)).toBe(true);expect(r.diagnostics.some(d=>d.severity==='error')).toBe(true);}expect(cases.at(-1)?.diagnostics.at(-1)?.message).toContain('hash partitioning');
});
test('US-018-AC19: V2 features and repeated actions cannot be assembled as a multipart snapshot',async()=>{
 const {captureParquet}=await import('../../src');const e=report.results[0];for(const c of (await Bun.file(base+'negative-manifest.json').json()).cases){const parts=e.parts.map(({name,source}:any)=>({name,source}));parts[c.replaces].source=captureParquet(new Uint8Array(await Bun.file(c.path).arrayBuffer()),{id:c.id});const r=reconcileDeltaMultipartCheckpoint(e.version,e.partCount,parts,[]);expect(r.status).toBe('blocked');expect(r.recovery?.state).toBeUndefined();expect(check(r)).toBe(true);expect(r.diagnostics.some(d=>c.id==='v2-feature'?d.message.includes('v2Checkpoint forbids'):d.code==='DELTA_HISTORY_DUPLICATE')).toBe(true);}
});
test('US-018-AC19: invalid finite part counts retain schema-valid blocked evidence',()=>{for(const n of [-1,1.5,1001]){const r=reconcileDeltaMultipartCheckpoint('10',n,[],[]);expect(r.status).toBe('blocked');expect(check(r)).toBe(true);}});
