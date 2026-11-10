// SPDX-License-Identifier: MIT OR Apache-2.0
// US-907 red tests (STP-907). They fail until src/extensions/actions/bulk-state.ts exists and is
// exported from src/index. Expectations come ONLY from the owner fixture, which is hand-authored
// from CONTRACT-904 and never derived from the implementation under test.
import {test,expect} from 'bun:test';
import {readFileSync} from 'node:fs';
import * as api from '../src/index';

const fx=JSON.parse(readFileSync(new URL('../docs/helix/03-test/fixtures/bulk-update/transitions.json',import.meta.url),'utf8'));
const model=api as unknown as {
 applyBulkEvent(state:unknown,event:unknown):{ok:boolean;state?:any;code?:string;basis?:string};
 bulkDecisionOrder(input:unknown):Record<string,unknown>;
 nextBulkFence(fence:string):string;
 bulkItemToken(namespace:string,id:string,batch:number,item:number):string;
 parseBulkItemToken(key:string):{namespace:string;id:string;batch:number;item:number};
 isReservedBulkKey(key:string):boolean;
 checkBulkKeyUse(key:string,viaBulk:boolean):{ok:boolean;code?:string};
};
const frozen=<T>(v:T):T=>{const c=structuredClone(v);return c;};
const run=(c:{state:unknown;event:unknown})=>{const state=frozen(c.state),event=frozen(c.event);const r=model.applyBulkEvent(state,event);expect(state).toEqual(c.state);expect(event).toEqual(c.event);return r;};
const byAc=(ac:string)=>fx.transitions.filter((c:any)=>c.covers===ac);

test('@covers US-907-AC1 transition_table: every table row yields its exact next state',()=>{
 for(const c of byAc('US-907-AC1').filter((x:any)=>x.expect.ok)){const r=run(c);expect(r.ok,c.id).toBe(true);expect(r.state,c.id).toMatchObject(c.expect.state);if(c.expect.basis)expect(r.basis,c.id).toBe(c.expect.basis);}
});
test('@covers US-907-AC1 transition_table: every unlisted state/event pair refuses and terminals are absorbing',()=>{
 const permitted=new Set(fx.permittedPairs.map((p:string[])=>p.join('|')));
 for(const [sk,state] of Object.entries(fx.samples))for(const [ek,event] of Object.entries(fx.eventSamples)){
  const r=run({state,event}),want=permitted.has(sk+'|'+ek);
  expect(r.ok,sk+'|'+ek).toBe(want);
  if(want&&['completed','stopped','cancelled'].includes(sk))expect(r.state,sk+'|'+ek).toMatchObject(state as object);
 }
 for(const c of byAc('US-907-AC1').filter((x:any)=>!x.expect.ok)){expect(run(c).ok,c.id).toBe(false);}
});
test('@covers US-907-AC2 claim_fence_lease: fences are exact unsigned decimal text without wrap',()=>{
 for(const [from,to] of fx.fences.next)expect(model.nextBulkFence(from)).toBe(to);
 for(const bad of fx.fences.invalid)expect(()=>model.nextBulkFence(bad),JSON.stringify(bad)).toThrow();
 expect(()=>model.nextBulkFence(1 as unknown as string)).toThrow();
});
test('@covers US-907-AC2 claim_fence_lease: stale/absent/wrong-batch refuse with contract codes; expiry alone never re-executes',()=>{
 for(const c of byAc('US-907-AC2')){const r=run(c);expect(r.ok,c.id).toBe(c.expect.ok);if(c.expect.ok)expect(r.state,c.id).toMatchObject(c.expect.state);else if(c.expect.code)expect(r.code,c.id).toBe(c.expect.code);}
});
test('@covers US-907-AC3 reconcile_exits: commit restores prefix, admitted noncommit stops, ambiguity stays reconciling',()=>{
 for(const c of byAc('US-907-AC3')){const r=run(c);expect(r.ok,c.id).toBe(c.expect.ok);if(c.expect.ok){expect(r.state,c.id).toMatchObject(c.expect.state);if(c.expect.basis)expect(r.basis,c.id).toBe(c.expect.basis);}}
});
test('@covers US-907-AC4 cancel_serialization: both lock orders, no rollback assertion, cancelled only after settlement',()=>{
 for(const c of byAc('US-907-AC4')){const r=run(c);expect(r.ok,c.id).toBe(c.expect.ok);if(c.expect.ok){expect(r.state,c.id).toMatchObject(c.expect.state);if(c.expect.basis)expect(r.basis,c.id).toBe(c.expect.basis);}else if(c.expect.code)expect(r.code,c.id).toBe(c.expect.code);}
 const pending=byAc('US-907-AC4').find((c:any)=>c.id==='cancel-admitted');expect(run(pending).state.status).toBe('running');
});
test('@covers US-907-AC5 guard_before_tx1: delegation then guards precede tx/1; guard failures are never translated',()=>{
 for(const c of fx.decisionOrder){const input=frozen(c.input),r=model.bulkDecisionOrder(input);expect(input).toEqual(c.input);expect(r,c.id).toMatchObject(c.expect);}
 for(const c of fx.decisionOrder.filter((x:any)=>x.expect.code==='PAP_GUARD'))expect(['EXPECTED_VERSION','ENTITY_MISSING']).not.toContain((model.bulkDecisionOrder(c.input) as any).code);
});
test('@covers US-907-AC6 token_and_ref_grammar: injective pap1 tokens within the tx/1 length bound',()=>{
 const t=fx.tokens;
 for(const v of t.valid){const k=model.bulkItemToken(v.ns,v.id,v.batch,v.item);expect(k).toBe(v.token);expect(k.length).toBeLessThanOrEqual(t.maxTokenUnits);expect(model.parseBulkItemToken(k)).toEqual({namespace:v.ns,id:v.id,batch:v.batch,item:v.item});}
 for(const v of t.invalid)expect(()=>model.bulkItemToken(v.ns,v.id,v.batch as number,v.item as number),JSON.stringify(v)).toThrow();
 for(const [a,b] of t.distinct)expect(model.bulkItemToken(a.ns,a.id,a.batch,a.item)).not.toBe(model.bulkItemToken(b.ns,b.id,b.batch,b.item));
 for(const k of t.parseRefuse)expect(()=>model.parseBulkItemToken(k),k).toThrow();
});
test('@covers US-907-AC6 token_and_ref_grammar: reserved keys refuse outside the registered bulk path',()=>{
 const t=fx.tokens;
 for(const k of t.reserved){expect(model.isReservedBulkKey(k)).toBe(true);expect(model.checkBulkKeyUse(k,false).ok).toBe(false);expect(model.checkBulkKeyUse(k,true).ok).toBe(true);}
 for(const k of t.notReserved){expect(model.isReservedBulkKey(k)).toBe(false);expect(model.checkBulkKeyUse(k,false).ok).toBe(true);}
});
test('@covers US-907-AC7 formal_correspondence: fixture covers every table row and each broken-mechanism control fails',()=>{
 const rows=new Set(fx.transitions.filter((c:any)=>c.expect.ok).map((c:any)=>c.row));
 for(const r of fx.tableRows.filter((x:string)=>x!=='T11'))expect(rows.has(r),r).toBe(true);
 expect(fx.transitions.some((c:any)=>c.row==='T11')).toBe(true);
 const controls=new Map<string,any[]>();for(const c of [...fx.transitions,...fx.decisionOrder])if(c.control)(controls.get(c.control)??controls.set(c.control,[]).get(c.control)!).push(c);
 for(const name of fx.controls)expect(controls.has(name),name).toBe(true);
 for(const c of controls.get('resume-from-stopped')!)expect(run(c).ok).toBe(false);
 for(const c of controls.get('reexecute-on-expiry')!)expect(run(c).ok).toBe(false);
 for(const c of controls.get('rollback-from-not-found')!){const r=run(c);expect(r.state.status).toBe('reconciling');}
 for(const c of controls.get('guard-code-translated')!)expect((model.bulkDecisionOrder(c.input) as any).code).toBe('PAP_GUARD');
});
test.todo('@covers US-907-AC7 formal_correspondence: Truss BulkUpdate.tla consumes transitions.json and rejects the same broken mechanisms (cross-repo, owned by Truss US-048-AC7)',()=>{});
test.todo('@covers US-907-AC8 state_oracle_parity: actual Chromium evaluates the fixture via scripts/actions-bulk-state-browser.ts and agrees with the independent expectations',()=>{});
