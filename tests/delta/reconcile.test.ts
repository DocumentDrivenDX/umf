import {test,expect} from 'bun:test';
import {captureDeltaLog,reconcileDeltaCommits,coreSchema} from '../../src';
import {createValidator} from '../../src/validation/schema';
import schema from '../../spec/extensions/delta-log/reconciliation.schema.json';
import {renderTree} from '../../src/model/native-json';
const ajv=createValidator(false);ajv.addSchema(coreSchema);const check=ajv.compile(schema);
const protocol={protocol:{minReaderVersion:1,minWriterVersion:2}},metaData={metaData:{id:'table',format:{provider:'parquet'},schemaString:'{"type":"struct","fields":[]}',partitionColumns:[],configuration:{}}};
const commit=(version:string,actions:unknown[])=>({version,source:captureDeltaLog(actions.map(a=>JSON.stringify(a)).join('\n'),{id:version})});
const add=(path:string,dv?:unknown)=>({add:{path,partitionValues:{},size:1,modificationTime:0,dataChange:true,...(dv?{deletionVector:dv}:{})}});
test('US-018-AC11: native six-version history matches action state and preserves every source',async()=>{
 const data=await Bun.file('fixtures/delta/history/results.json').json();for(const r of data.results){const actual=reconcileDeltaCommits(r.sources);expect(actual).toEqual(r);expect(check(actual)).toBe(true);expect(actual.complete).toBe(false);}
 const last=data.results.at(-1).state;expect(last.adds.map((n:any)=>n.members.path.value)).toEqual(['a.parquet']);expect(last.removes.map((n:any)=>n.members.path.value)).toEqual(['b.parquet']);expect(last.transactions[0].members.version.value).toBe('2');expect(last.transactions[1].members.version.value).toBe('9223372036854775807');
});
test('US-018-AC11: gaps, duplicates, missing initial context, checkpoints and ambiguous file changes block',()=>{
 const zero=commit('0',[protocol,metaData,add('a')]);
 for(const history of [[],[commit('1',[protocol,metaData])],[zero,commit('2',[])],[commit('0',[protocol])],[zero,commit('1',[add('a'),add('a')])],[zero,commit('1',[{remove:{path:'a',dataChange:true}},add('a')])],[zero,commit('1',[{checkpointMetadata:{version:1}}])],[zero,commit('1',[{txn:{appId:'x',version:1}},{txn:{appId:'x',version:2}}])]]){const r=reconcileDeltaCommits(history);expect(r.status).toBe('blocked');expect(r.state).toBeUndefined();expect(r.diagnostics.some(d=>d.severity==='error')).toBe(true);}
});
test('US-018-AC11: DV changes are set-based; domains and unknown actions remain preserved',()=>{
 const a={storageType:'u',pathOrInlineDv:'first',sizeInBytes:1,cardinality:1},b={...a,pathOrInlineDv:'second'};
 const zero=commit('0',[protocol,metaData,add('p',a),{domainMetadata:{domain:'custom',configuration:'v1',removed:false}}]);
 const actions=[add('p',b),{remove:{path:'p',deletionVector:a,dataChange:true}},{domainMetadata:{domain:'custom',configuration:'v1',removed:true}},{future:{exact:'opaque'}},{cdc:{path:'changes',partitionValues:{},size:1,dataChange:false}},{commitInfo:42}];
 const first=reconcileDeltaCommits([zero,commit('1',actions)]),second=reconcileDeltaCommits([zero,commit('1',[...actions].reverse())]);expect(first.status).toBe('reconciled');expect(second.status).toBe('reconciled');expect(first.state?.adds).toEqual(second.state?.adds);expect(first.state?.removes).toEqual(second.state?.removes);expect(first.state?.domains).toEqual([]);expect(first.state?.deferred.map(a=>a.action)).toEqual(['future','cdc']);expect(renderTree(first.state!.commitInfo[0]!)).toBe('42');
 expect(reconcileDeltaCommits([zero,commit('1',[add('p',b)])]).status).toBe('blocked');
 const recovered=reconcileDeltaCommits([zero,commit('1',[{remove:{path:'p',deletionVector:a,dataChange:true}}]),commit('2',[add('p',a)])]);expect(recovered.state?.removes).toEqual([]);
});
