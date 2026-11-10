// SPDX-License-Identifier: MIT OR Apache-2.0
// US-907-AC8 shared corpus: runs the owner fixture through any build of the public API and returns
// plain JSON results. Used in Bun and in Chromium; the driver compares both with the fixture, never
// with a value computed from the implementation alone.
export function runBulkStateCorpus(api:any,fx:any):any[]{
 const out:any[]=[];
 const clone=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
 const step=(id:string,f:()=>any)=>{try{out.push({id,...f()});}catch(e){out.push({id,threw:true});}};
 for(const c of fx.transitions)step('t:'+c.id,()=>{const r=api.applyBulkEvent(clone(c.state),clone(c.event));return {ok:r.ok,code:r.code??null,basis:r.basis??null,state:r.ok?r.state:null};});
 for(const [sk,state] of Object.entries(fx.samples))for(const [ek,event] of Object.entries(fx.eventSamples))step('p:'+sk+'|'+ek,()=>{const r=api.applyBulkEvent(clone(state),clone(event));return {ok:r.ok};});
 for(const c of fx.decisionOrder)step('d:'+c.id,()=>({r:api.bulkDecisionOrder(clone(c.input))}));
 for(const [from] of fx.fences.next)step('f:'+from,()=>({to:api.nextBulkFence(from)}));
 for(const bad of fx.fences.invalid)step('fi:'+JSON.stringify(bad),()=>({to:api.nextBulkFence(bad)}));
 for(const v of fx.tokens.valid)step('k:'+v.token,()=>{const k=api.bulkItemToken(v.ns,v.id,v.batch,v.item);return {k,parsed:api.parseBulkItemToken(k)};});
 for(const v of fx.tokens.invalid)step('ki:'+JSON.stringify(v),()=>({k:api.bulkItemToken(v.ns,v.id,v.batch,v.item)}));
 for(const k of fx.tokens.parseRefuse)step('kp:'+k,()=>({p:api.parseBulkItemToken(k)}));
 for(const k of fx.tokens.reserved)step('r:'+k,()=>({r:api.isReservedBulkKey(k),u:api.checkBulkKeyUse(k,false)}));
 return out;
}
