import {describe,expect,it} from 'bun:test';
import {reconcileDeltaParquetCheckpoint} from '../../src/index-node-v4';

const fixture='fixtures/delta/parquet-checkpoint/results.json';

describe('Delta Parquet checkpoint recovery through the native default root',()=>{
  it('replays an explicit V1 checkpoint and preserves its source',async()=>{
    const report=await Bun.file(fixture).json();
    const sample=report.results.find((entry:any)=>entry.id==='v1').result;
    const result=reconcileDeltaParquetCheckpoint(sample.checkpoint,sample.sources,'v1');
    expect(result.status).toBe('reconciled');
    expect(result.recovery?.state?.version).toBe(sample.checkpoint.version);
    expect(result.checkpoint).toEqual(sample.checkpoint);
    expect(result.complete).toBe(false);
  },60_000);

  it('refuses a V2 checkpoint when a referenced sidecar is not explicitly supplied',async()=>{
    const report=await Bun.file(fixture).json();
    const sample=report.results.find((entry:any)=>entry.id==='v2-sidecars').result;
    const result=reconcileDeltaParquetCheckpoint(sample.checkpoint,sample.sources,'v2',[]);
    expect(result.status).toBe('blocked');
    expect(result.recovery?.state).toBeUndefined();
    expect(result.diagnostics.some((item:any)=>item.code==='DELTA_SIDECAR_BINDING'&&item.severity==='error')).toBe(true);
  },30_000);
});
