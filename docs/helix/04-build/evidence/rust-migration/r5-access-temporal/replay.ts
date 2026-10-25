import {parseAccessTemporal,ACCESS_TEMPORAL_PROFILE} from '../../../../../../src/adapters/access-temporal';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
const packet=JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r5-access-temporal/predecessor.json','utf8'));
let checked=0;
const special=(id:string):{kind:any;token:any;extra?:Record<string,unknown>}=>{
 if(id==='raw-null')return {kind:'instant',token:null};
 if(id==='raw-number')return {kind:'instant',token:42};
 if(id==='raw-object')return {kind:'instant',token:{}};
 if(id==='raw-array')return {kind:'instant',token:[]};
 if(id==='raw-date')return {kind:'instant',token:new Date(0)};
 if(id==='raw-boxed-string')return {kind:'instant',token:new String('2024-01-01')};
 if(id==='raw-proxy-token'){const trace:string[]=[];const token=new Proxy({}, {getPrototypeOf(){trace.push('getPrototypeOf');return Object.prototype;},get(){trace.push('get');return '2024-01-01';}});return {kind:'date',token,extra:{trace}};}
 if(id==='raw-accessor-object-token'){let getterCalls=0;const token={get value(){getterCalls++;return '2024-01-01';}};return {kind:'date',token,extra:{getterCalls:()=>getterCalls}};}
 throw new Error(`Unknown raw case ${id}`);
};
const paths=Object.keys(packet.sourceHashes);
for(const path of paths){const hash=createHash('sha256').update(readFileSync(path)).digest('hex');if(hash!==packet.sourceHashes[path])throw new Error(`Source drift: ${path}`);}
for(const c of packet.cases){
 let kind=c.input.kind,token=c.input.token,extra:any={};
 if(c.hostOnly){const raw=special(c.id);kind=raw.kind;token=raw.token;extra=raw.extra??{};}
 let actual:any;try{actual={status:'ok',value:parseAccessTemporal(kind,token)};}catch(e:any){actual={status:'error',name:e?.name,message:e?.message};}
 if(c.id==='raw-accessor-object-token')actual.getterCalls=extra.getterCalls();
 if(c.id==='raw-proxy-token')actual.trace=extra.trace;
 if(JSON.stringify(actual)!==JSON.stringify(c.outcome))throw new Error(`${c.id}: ${JSON.stringify(actual)} != ${JSON.stringify(c.outcome)}`);
 checked++;
}
if(packet.profile!==ACCESS_TEMPORAL_PROFILE)throw new Error('Profile drift');
console.log(`Access temporal predecessor matched ${checked}/${checked} cases on Bun ${Bun.version}`);
