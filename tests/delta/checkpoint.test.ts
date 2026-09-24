import {test,expect} from 'bun:test';
import {captureDeltaLog,exportDeltaLog,reconcileDeltaCheckpoint,coreSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/delta-log/reconciliation.schema.json';
const ajv=createValidator(false);ajv.addSchema(coreSchema);const check=ajv.compile(schema);
const text=await Bun.file('fixtures/delta/checkpoint/checkpoint.jsonl').text(),base=text.trim().split('\n').map(line=>JSON.parse(line)).filter(a=>a.txn?.appId!=='other');
const cp=(actions:unknown[]=base,version='10')=>({version,source:captureDeltaLog(actions.map(a=>JSON.stringify(a)).join('\n'),{id:'cp'})});
test('US-018-AC13: checkpoint and following commits reproduce native-backed states without earlier history',async()=>{
 const report=await Bun.file('fixtures/delta/checkpoint/results.json').json();for(const expected of report.results){const actual=reconcileDeltaCheckpoint(expected.checkpoint,expected.sources);expect(actual).toEqual(expected);expect(check(actual)).toBe(true);expect(actual.complete).toBe(false);expect(exportDeltaLog(actual.checkpoint!.source)).toBe(text);}
});
test('US-018-AC13: checkpoint invariants and missing sidecars block without partial state',()=>{
 const cases=[cp(base.filter(a=>!a.checkpointMetadata)),cp([...base,{checkpointMetadata:{version:10}}]),cp(base,'9'),cp(base.map(a=>a.protocol?{protocol:{minReaderVersion:1,minWriterVersion:2}}:a)),cp([...base,{commitInfo:{operation:'invalid'}}]),cp([...base,{cdc:{path:'c',size:1,partitionValues:{},dataChange:false}}]),cp([...base,{domainMetadata:{domain:'gone',configuration:'{}',removed:true}}]),cp([...base,{sidecar:{path:'missing.parquet',sizeInBytes:1,modificationTime:0}}]),cp(base,'9223372036854775808')];
 for(const checkpoint of cases){const r=reconcileDeltaCheckpoint(checkpoint,[]);expect(r.status).toBe('blocked');expect(r.state).toBeUndefined();expect(r.checkpoint).toEqual(checkpoint);expect(r.diagnostics.some(d=>d.severity==='error'&&d.path.startsWith('/checkpoint'))).toBe(true);expect(check(r)).toBe(true);}
 const gap=reconcileDeltaCheckpoint(cp(),[{version:'12',source:captureDeltaLog('{"commitInfo":{}}',{id:'gap'})}]);expect(gap.status).toBe('blocked');expect(gap.diagnostics.some(d=>d.path==='/sources/0/version')).toBe(true);
});
test('US-018-AC13: both pinned upstream JSON checkpoints retain source and report unresolved Parquet sidecars',async()=>{
 const root='fixtures/delta/upstream/',m=await Bun.file(root+'manifest.json').json(),files=m.files.filter((f:any)=>/\.checkpoint\..*\.json$/.test(f.path));expect(files).toHaveLength(2);
 for(const f of files){const raw=await Bun.file(root+f.path).text(),version=BigInt(f.path.split('/').at(-1).split('.')[0]).toString(),r=reconcileDeltaCheckpoint({version,source:captureDeltaLog(raw,{id:f.path})},[]);expect(r.status).toBe('blocked');expect(r.diagnostics.some(d=>d.code==='DELTA_CHECKPOINT_SIDECAR_UNRESOLVED')).toBe(true);expect(exportDeltaLog(r.checkpoint!.source)).toBe(raw);}
});
