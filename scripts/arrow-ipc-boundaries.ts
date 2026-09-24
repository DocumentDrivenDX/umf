import {probeIpc} from '../native/arrow/ipc-probe';
const base='fixtures/arrow/ipc-inputs/';const original=new Uint8Array(await Bun.file(base+'int64.stream.arrow').arrayBuffer());
const joined=new Uint8Array(original.length*2);joined.set(original);joined.set(original,original.length);
const trailing=new Uint8Array(original.length+4);trailing.set(original);trailing.set([1,2,3,4],original.length);
const cases=[{id:'empty',bytes:new Uint8Array()},{id:'truncated-schema',bytes:original.slice(0,20)}, {id:'truncated-second-body',bytes:original.slice(0,original.length-20)},{id:'missing-eos',bytes:original.slice(0,-8)},{id:'trailing-garbage',bytes:trailing},{id:'concatenated-streams',bytes:joined}];
const results=cases.map(c=>{try{const result=probeIpc(c.bytes);return {id:c.id,status:'accepted',rows:result.rows,batches:result.batches};}catch(e){return {id:c.id,status:'rejected',message:(e as Error).message};}});
if(results.map(r=>r.status).join(',')!=='rejected,rejected,rejected,accepted,accepted,accepted')throw Error('IPC boundary baseline changed');
for(const r of results)if(r.status==='accepted'&&(r.rows!==6||r.batches!==2))throw Error('IPC boundary consumption changed');
await Bun.write(base+'boundary-results.json',JSON.stringify(results,null,2)+'\n');console.log(results);
