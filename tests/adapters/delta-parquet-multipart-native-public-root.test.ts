import {describe,expect,it} from 'bun:test';
import {reconcileDeltaMultipartCheckpoint} from '../../src/index-node-v4';

describe('Delta multipart recovery through the native default root',()=>{
  it('assembles out-of-order captured parts and restores the source version',async()=>{
    const fixture=await Bun.file('fixtures/delta/multipart/results.json').json();
    const sample=fixture.results[0];
    const report=reconcileDeltaMultipartCheckpoint(sample.version,sample.partCount,sample.parts,sample.sources);
    expect(report.status).toBe('reconciled');
    expect(report.complete).toBe(false);
    expect(report.recovery?.state?.version).toBe(sample.version);
    expect(report.parts.map((part:any)=>part.name)).toEqual(sample.parts.map((part:any)=>part.name));
  },60_000);
  it('refuses duplicate part identity without returning a recovery',async()=>{
    const fixture=await Bun.file('fixtures/delta/multipart/results.json').json();
    const sample=fixture.results[0];
    const duplicate=[sample.parts[0],sample.parts[0]];
    const report=reconcileDeltaMultipartCheckpoint(sample.version,2,duplicate,[]);
    expect(report.status).toBe('blocked');
    expect(report.recovery).toBeUndefined();
    expect(report.diagnostics.some((row:any)=>row.code==='DELTA_MULTIPART_BLOCKED')).toBe(true);
  },30_000);
});
