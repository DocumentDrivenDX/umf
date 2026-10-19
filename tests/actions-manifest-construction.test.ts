// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import * as api from '../src/index';
import {createManifestCorpusFixture} from './actions-manifest-corpus';
import {sha256Text} from '../src/extensions/actions/plan-artifacts';
import type {ActionManifestConstruction} from '../src/extensions/actions/manifest-construction';
const artifact=(value:unknown)=>{const utf8=typeof value==='string'?value:JSON.stringify(value);return {mediaType:'application/json',utf8,sha256:sha256Text(utf8)};};
export function constructionFixture(){
 const f=createManifestCorpusFixture(api);
 const request:ActionManifestConstruction={plan:artifact(JSON.stringify(f.plan,null,2)),action:f.body.action,basis:f.body.basis,rows:f.body.items.map(item=>({entity:item.entity,guard:item.guard,keyReceipt:api.encodeCoreKeyTuple(f.document,item.entity.key,item.entity.components)}))};
 return {...f,request};
}
test('@covers US-903-AC7 pure construction preserves original plan, Key receipts and exact original invocation semantics',()=>{
 const f=constructionFixture(),before=structuredClone(f.request),r=api.constructActionManifest(f.request,f.context),m=JSON.parse(r.artifact.utf8);
 expect(m).toEqual({...f.body,plan:f.request.plan});expect(r.keyReceipts).toEqual(f.request.rows.map(row=>row.keyReceipt));
 expect(r).toMatchObject({sealed:false,complete:false,authority:false});expect(f.request).toEqual(before);
 expect(m.batches).toEqual([{ordinal:0,start:0,count:2},{ordinal:1,start:2,count:1}]);
 expect(m.items.map((i:any)=>i.guard.identity)).toEqual(['2','10','11']); // Preserve native order; lexical sorting would change it.
 expect(m.items[0].inputs).toEqual({customer:f.request.rows[0]!.entity,'active-value':{boolean:false}});
 expect(m.items[0].expectedVersions).toEqual([{frame:'customer-write',version:'v2'}]);
 expect(api.inspectActionManifest(r.artifact,f.context).eligible).toBe(true);
 r.keyReceipts[0]!.bytesHex='bad';expect(f.request.rows[0]!.keyReceipt.bytesHex).not.toBe('bad');
});
test('@covers US-903-AC7 empty work has no fabricated items, batches or receipts',()=>{
 const f=constructionFixture();f.request.rows=[];const r=api.constructActionManifest(f.request,f.context),m=JSON.parse(r.artifact.utf8);
 expect(m.items).toEqual([]);expect(m.batches).toEqual([]);expect(r.keyReceipts).toEqual([]);expect(r.sealed).toBe(false);
});
test('@covers US-903-AC7 original numeric Key equality preserves distinct receipt and row spellings',()=>{
 const f=constructionFixture(),id=f.document.modules[0]!.elements.find(e=>e.id==='customer-id')!;
 id.scalarType='integer';id.facets={integerWidth:{bits:64,signed:true}};
 const model=artifact(f.document);f.pin.sha256=model.sha256;f.action.documentSha256=model.sha256;
 f.context.models[0]!.artifact=model;f.context.actions[0]!.artifact=model;f.request.action.documentSha256=model.sha256;f.request.plan=artifact(f.plan);
 f.request.rows.forEach((row,i)=>{row.entity.components=[{integerToken:String(i+1)+'.0'}];row.keyReceipt=api.encodeCoreKeyTuple(f.document,row.entity.key,[{integerToken:String(i+1)}]);});
 const result=api.constructActionManifest(f.request,f.context),body=JSON.parse(result.artifact.utf8);
 expect(result.keyReceipts[0]!.values).toEqual([{integerToken:'1'}]);expect(body.items[0].entity.components).toEqual([{integerToken:'1.0'}]);
 expect(api.inspectActionManifest(result.artifact,f.context).eligible).toBe(true);
});
test('@covers US-903-AC7 original source, tuple, identity, guard and complete intent substitutions refuse atomically',()=>{
 const controls:((r:any)=>void)[]=[
  r=>r.rows[0].keyReceipt.bytesHex='00',r=>r.rows[0].keyReceipt.source.id='substitute',r=>r.rows[0].keyReceipt.identity.key='other',
  r=>r.rows[0].keyReceipt.values=[{string:'another'}],r=>r.rows[0].entity.components=[{string:'another'}],
  r=>r.rows[0].guard.epoch='other',r=>r.rows[0].guard.store='other',r=>r.rows[1].guard.identity=r.rows[0].guard.identity,
  r=>r.rows[1].entity=r.rows[0].entity,r=>r.action.documentSha256='0'.repeat(64),r=>r.basis.selectionSha256='0'.repeat(64),
  r=>r.extra=true,r=>r.rows[0].extra=true,r=>r.rows[0].entity=null,r=>r.rows[0].guard=null,r=>delete r.rows[0].keyReceipt,
  r=>r.rows[0].keyReceipt.future=true,r=>r.plan.sha256='0'.repeat(64),
 ];
 for(const mutate of controls){const f=constructionFixture();mutate(f.request);expect(()=>api.constructActionManifest(f.request,f.context)).toThrow();}
});
test('@covers US-903-AC7 finite item/byte bounds and accessors refuse without exposing partial work',()=>{
 for(const limits of [{maxItems:2,maxManifestBytes:16777216},{maxItems:10000,maxManifestBytes:256}]){
  const f=constructionFixture();f.plan.limits=limits;f.request.plan=artifact(f.plan);expect(()=>api.constructActionManifest(f.request,f.context)).toThrow();
 }
 const f=constructionFixture();let calls=0;Object.defineProperty(f.request.rows[0]!,'keyReceipt',{enumerable:true,get(){calls++;throw Error('must not run');}});
 expect(()=>api.constructActionManifest(f.request,f.context)).toThrow();expect(calls).toBe(0);
});
test('@covers US-903-AC7 malformed guard versions return source-qualified errors',()=>{
 for(const version of [undefined,null,0,'']){const f=constructionFixture();if(version===undefined)delete (f.request.rows[0]!.guard as any).version;else (f.request.rows[0]!.guard as any).version=version;
  try{api.constructActionManifest(f.request,f.context);throw Error('accepted malformed guard');}catch(error){expect(error).toBeInstanceOf(api.UmfError);expect((error as api.UmfError).code).toBe('PAP_INVALID');expect((error as api.UmfError).path).toBe('/rows/0/guard/version');}
 }
});
test('@covers US-903-AC7 repeated plan constants are charged before output serialization',()=>{
 const f=constructionFixture(),field=f.document.modules[0]!.elements.find(e=>e.id==='active')!;field.scalarType='string';
 const model=artifact(f.document);f.pin.sha256=model.sha256;f.action.documentSha256=model.sha256;f.context.models[0]!.artifact=model;f.context.actions[0]!.artifact=model;f.request.action.documentSha256=model.sha256;
 f.plan.inputs.assignments[0]!.value={string:'x'.repeat(10000)};f.plan.limits.maxManifestBytes=30000;f.request.plan=artifact(f.plan);
 f.request.rows.forEach(row=>{row.keyReceipt=api.encodeCoreKeyTuple(f.document,row.entity.key,row.entity.components as import('../src/model/key-tuple').CoreKeyTupleValue[]);});
 try{api.constructActionManifest(f.request,f.context);throw Error('accepted expanded output');}catch(error){expect(error).toBeInstanceOf(api.UmfError);expect((error as api.UmfError).code).toBe('LIMIT');expect((error as Error).message).toContain('serialized JSON exceeds byte limit');}
});
