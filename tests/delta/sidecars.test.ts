import {test,expect} from 'bun:test';
import {captureDeltaLog,captureParquet,exportDeltaLog,exportParquetCapture,reconcileDeltaCheckpointSidecars,coreSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/delta-log/sidecar-reconciliation.schema.json';
const ajv=createValidator(false);ajv.addSchema(coreSchema);const check=ajv.compile(schema),base='fixtures/delta/sidecars/',report=await Bun.file(base+'results.json').json(),first=report.results[0];
test('US-018-AC16: native sidecar checkpoints recover states and retain origin/source evidence',()=>{
 for(const expected of report.results){const r=reconcileDeltaCheckpointSidecars(expected.checkpoint,expected.sources,expected.sidecars);expect(r).toEqual(expected);expect(check(r)).toBe(true);expect(r.state?.removes.some((x:any)=>x.members.path.value==='retired.parquet')).toBe(true);expect(r.origins!.filter(o=>o.sidecar!==undefined)).toHaveLength(3);expect(r.checkpoint).not.toBe(expected.checkpoint);expect(r.sidecars).not.toBe(expected.sidecars);for(const [i,s] of r.sidecars.entries())expect(exportParquetCapture(s.source)).toEqual(exportParquetCapture(expected.sidecars[i].source));}
});
test('US-018-AC16: missing, duplicate, extra, mismatched and mixed sidecars block atomically',()=>{
 const raw=exportDeltaLog(first.checkpoint.source),actions=raw.trim().split('\n').map(x=>JSON.parse(x)).filter(x=>x.txn?.appId!=='other'),cp=(xs:unknown[])=>({...first.checkpoint,source:captureDeltaLog(xs.map(x=>JSON.stringify(x)).join('\n'),{id:'bad'})});
 const references=actions.filter(x=>x.sidecar),changed=structuredClone(actions);changed.find(x=>x.sidecar).sidecar.sizeInBytes++;
 const cases=[{cp:first.checkpoint,sc:[]},{cp:first.checkpoint,sc:[...first.sidecars,first.sidecars[0]]},{cp:first.checkpoint,sc:[...first.sidecars,{...first.sidecars[0],path:'extra'}]},{cp:cp([...actions,references[0]]),sc:first.sidecars},{cp:cp(changed),sc:first.sidecars},{cp:cp([...actions,{add:{path:'embedded',size:1,partitionValues:{},modificationTime:0,dataChange:false}}]),sc:first.sidecars}];
 for(const c of cases){const r=reconcileDeltaCheckpointSidecars(c.cp,[],c.sc);expect(r.status).toBe('blocked');expect(r.state).toBeUndefined();expect(r.checkpoint).toEqual(c.cp);expect(r.sidecars).toEqual(c.sc);expect(check(r)).toBe(true);expect(r.diagnostics.some(d=>d.code==='DELTA_SIDECAR_BINDING')).toBe(true);}
});
test('US-018-AC16: nonfile sidecar actions and malformed bytes cannot seed state',async()=>{
 for(const bytes of [new Uint8Array(await Bun.file('fixtures/delta/parquet-actions/authored/exact-and-unknown.parquet').arrayBuffer()),new Uint8Array([1,2,3])]){
 const sidecars=[{path:'bad',source:captureParquet(bytes,{id:'bad'})}],xs=exportDeltaLog(first.checkpoint.source).trim().split('\n').map(x=>JSON.parse(x)).filter(x=>!x.sidecar&&x.txn?.appId!=='other');xs.push({sidecar:{path:'bad',sizeInBytes:bytes.length,modificationTime:0}});const checkpoint={version:'10',source:captureDeltaLog(xs.map(x=>JSON.stringify(x)).join('\n'),{id:'bad-cp'})},r=reconcileDeltaCheckpointSidecars(checkpoint,[],sidecars);expect(r.status).toBe('blocked');expect(r.state).toBeUndefined();expect(check(r)).toBe(true);expect(exportParquetCapture(r.sidecars[0]!.source)).toEqual(bytes);
 }
});
test('US-018-AC16: supplied upstream sidecars retain typed-statistics blockers and all bytes',async()=>{
 const upstream=await Bun.file(base+'upstream-results.json').json();expect(upstream.results).toHaveLength(2);for(const expected of upstream.results){const r=reconcileDeltaCheckpointSidecars(expected.checkpoint,[],expected.sidecars);expect(r.status).toBe('blocked');expect(r.state).toBeUndefined();expect(r.diagnostics.some(d=>d.code==='DELTA_PARQUET_CONVERSION'&&d.message.includes('int96'))).toBe(true);expect(r.sidecars).toEqual(expected.sidecars);expect(check(r)).toBe(true);}
});
