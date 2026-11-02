import {describe,expect,it} from 'bun:test';
import {reconcileDeltaCheckpointSidecars} from '../../src/index-node-v4';

const fixture='fixtures/delta/sidecars/results.json';

describe('Delta JSONL checkpoint sidecars through the native default root',()=>{
  it('projects explicit sidecars and replays the checkpoint state',async()=>{
    const packet=await Bun.file(fixture).json();
    const sample=packet.results[0];
    const result=reconcileDeltaCheckpointSidecars(sample.checkpoint,sample.sources,sample.sidecars);
    expect(result.status).toBe('reconciled');
    expect(result.state?.version).toBe(sample.checkpoint.version);
    expect(result.origins?.filter(origin=>origin.sidecar!==undefined)).toHaveLength(3);
    expect(result.checkpoint).toEqual(sample.checkpoint);
    expect(result.sidecars).toEqual(sample.sidecars);
    expect(result.complete).toBe(false);
  },60_000);

  it('blocks missing sidecars without returning a partial state',async()=>{
    const packet=await Bun.file(fixture).json();
    const sample=packet.results[0];
    const result=reconcileDeltaCheckpointSidecars(sample.checkpoint,sample.sources,[]);
    expect(result.status).toBe('blocked');
    expect(result.state).toBeUndefined();
    expect(result.checkpoint).toEqual(sample.checkpoint);
    expect(result.diagnostics.some(item=>item.code==='DELTA_SIDECAR_BINDING'&&item.severity==='error')).toBe(true);
  },30_000);
});
