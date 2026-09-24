import {test,expect} from 'bun:test';
import {reconcileDeltaParquetCheckpoint,reconcileDeltaCheckpoint,exportParquetCapture,readDocument,writeDocument,coreSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/delta-log/parquet-checkpoint.schema.json';
const ajv=createValidator(false);ajv.addSchema(coreSchema);const check=ajv.compile(schema),base='fixtures/delta/parquet-checkpoint/',report=await Bun.file(base+'results.json').json();
test('US-018-AC18: explicit V1/V2 Parquet checkpoint recovery agrees with nine native snapshots',()=>{
 for(const c of report.results){const e=c.result,r=reconcileDeltaParquetCheckpoint(e.checkpoint,e.sources,e.spec,e.sidecars);expect(r).toEqual(e);expect(check(r)).toBe(true);expect(r.recovery?.state?.version).toBe(c.version);expect(r.complete).toBe(false);for(const format of ['json','yaml'] as const)expect(exportParquetCapture(readDocument(writeDocument(r.checkpoint.source,format),format))).toEqual(exportParquetCapture(e.checkpoint.source));}
},30000);
test('US-018-AC18: wrong checkpoint specs, missing sidecars and missing successors cannot produce state',()=>{
 const v1=report.results.find((x:any)=>x.id==='v1').result,v2=report.results.find((x:any)=>x.id==='v2-embedded').result,sc=report.results.find((x:any)=>x.id==='v2-sidecars').result;
 const cases=[reconcileDeltaParquetCheckpoint(v1.checkpoint,[],'v2'),reconcileDeltaParquetCheckpoint(v2.checkpoint,[],'v1'),reconcileDeltaParquetCheckpoint(sc.checkpoint,[],'v2'),reconcileDeltaParquetCheckpoint(v1.checkpoint,[],'v1',sc.sidecars),reconcileDeltaParquetCheckpoint(v1.checkpoint,[{version:'12',source:report.results[1].result.sources[0].source}],'v1')];
 for(const r of cases){expect(r.status).toBe('blocked');expect(r.recovery?.state).toBeUndefined();expect(check(r)).toBe(true);expect(r.diagnostics.some(d=>d.severity==='error')).toBe(true);}
 expect(reconcileDeltaCheckpoint(sc.projection.log?{version:'10',source:sc.projection.log}:sc.checkpoint,[],'v1').status).toBe('blocked');
});
test('US-018-AC18: pinned single-file checkpoints preserve bounded recovery outcomes',async()=>{
 const upstream=await Bun.file(base+'upstream-results.json').json();expect(upstream.results).toHaveLength(32);expect(upstream.results.filter((x:any)=>x.status==='reconciled')).toHaveLength(29);for(const c of upstream.results){const e=c.result,r=reconcileDeltaParquetCheckpoint(e.checkpoint,[],e.spec,e.sidecars);expect(r.status).toBe(e.status);expect(r.recovery?.state).toEqual(e.recovery?.state);expect(check(r)).toBe(true);expect(exportParquetCapture(r.checkpoint.source)).toEqual(exportParquetCapture(e.checkpoint.source));}
},30000);
