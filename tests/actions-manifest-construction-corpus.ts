// SPDX-License-Identifier: MIT OR Apache-2.0
import type * as API from '../src/index';
import {createManifestCorpusFixture} from './actions-manifest-corpus';
import {sha256Text} from '../src/extensions/actions/plan-artifacts';
export function runConstructionCorpus(api:typeof API){
 const f=createManifestCorpusFixture(api),request={plan:f.body.plan,action:f.body.action,basis:f.body.basis,rows:f.body.items.map(i=>({entity:i.entity,guard:i.guard,keyReceipt:api.encodeCoreKeyTuple(f.document,i.entity.key,i.entity.components)}))};
 const result=api.constructActionManifest(request,f.context),body=JSON.parse(result.artifact.utf8);
 if(JSON.stringify(body.batches)!==JSON.stringify([{count:2,ordinal:0,start:0},{count:1,ordinal:1,start:2}])||body.items[0].inputs['active-value'].boolean!==false||body.items[0].expectedVersions[0].frame!=='customer-write'||result.sealed||result.authority||result.complete)throw Error('Independent construction oracle mismatch');
 if(result.artifact.sha256!==sha256Text(result.artifact.utf8,16777216))throw Error('Manifest digest mismatch');
 let refusals=0;for(const mutate of [(r:any)=>r.rows[0].keyReceipt.bytesHex='00',(r:any)=>r.rows[0].guard.epoch='other',(r:any)=>r.rows[1].guard.identity=r.rows[0].guard.identity,(r:any)=>r.extra=true]){
  const r=JSON.parse(JSON.stringify(request));mutate(r);let refused=false;try{api.constructActionManifest(r,f.context);}catch{refused=true;}if(!refused)throw Error('Construction negative control accepted');refusals++;
 }
 request.rows=[];const empty=JSON.parse(api.constructActionManifest(request,f.context).artifact.utf8);if(empty.items.length||empty.batches.length)throw Error('Empty construction mismatch');
 const make=()=>{const f=createManifestCorpusFixture(api);return {...f,request:{plan:f.body.plan,action:f.body.action,basis:f.body.basis,rows:f.body.items.map(i=>({entity:i.entity,guard:i.guard,keyReceipt:api.encodeCoreKeyTuple(f.document,i.entity.key,i.entity.components)}))}};};
 const update=(f:ReturnType<typeof make>)=>{const utf8=JSON.stringify(f.document),model={mediaType:'application/json',utf8,sha256:sha256Text(utf8)};f.pin.sha256=model.sha256;f.action.documentSha256=model.sha256;f.context.models[0]!.artifact=model;f.context.actions[0]!.artifact=model;f.request.action.documentSha256=model.sha256;const text=JSON.stringify(f.plan);f.request.plan={mediaType:'application/json',utf8:text,sha256:sha256Text(text)};};
 const numeric=make(),id=numeric.document.modules[0]!.elements.find(e=>e.id==='customer-id')!;id.scalarType='integer';id.facets={integerWidth:{bits:64,signed:true}};update(numeric);
 numeric.request.rows.forEach((r,i)=>{r.entity.components=[{integerToken:String(i+1)+'.0'}] as any;r.keyReceipt=api.encodeCoreKeyTuple(numeric.document,r.entity.key,[{integerToken:String(i+1)}]);});
 const numberResult=api.constructActionManifest(numeric.request,numeric.context);if(JSON.stringify(numberResult.keyReceipts[0]!.values)!==JSON.stringify([{integerToken:'1'}])||JSON.parse(numberResult.artifact.utf8).items[0].entity.components[0].integerToken!=='1.0')throw Error('Core numeric tuple equality/spelling mismatch');
 const expansion=make();expansion.document.modules[0]!.elements.find(e=>e.id==='active')!.scalarType='string';expansion.plan.inputs.assignments[0]!.value={string:'x'.repeat(10000)};expansion.plan.limits.maxManifestBytes=30000;update(expansion);expansion.request.rows.forEach(r=>{r.keyReceipt=api.encodeCoreKeyTuple(expansion.document,r.entity.key,r.entity.components);});
 let expanded=false;try{api.constructActionManifest(expansion.request,expansion.context);}catch(e){expanded=e instanceof api.UmfError&&e.code==='LIMIT'&&e.message.includes('serialized JSON exceeds byte limit');}if(!expanded)throw Error('Expanded output not charged before serialization');
 const missing=make();delete (missing.request.rows[0]!.guard as any).version;let qualified=false;try{api.constructActionManifest(missing.request,missing.context);}catch(e){qualified=e instanceof api.UmfError&&e.code==='PAP_INVALID'&&e.path==='/rows/0/guard/version';}if(!qualified)throw Error('Malformed guard lacks source-qualified error');
 const getter=make();let calls=0,refused=false;Object.defineProperty(getter.request.rows[0]!,'keyReceipt',{enumerable:true,get(){calls++;throw Error('must not execute');}});try{api.constructActionManifest(getter.request,getter.context);}catch{refused=true;}if(!refused||calls)throw Error('Accessor nonexecution failure');
 const isolation=make(),isolated=api.constructActionManifest(isolation.request,isolation.context);isolated.keyReceipts[0]!.bytesHex='bad';if(isolation.request.rows[0]!.keyReceipt.bytesHex==='bad')throw Error('Receipt copy isolation failure');
 return {positive:true,refusals,empty:true,numericTupleEquality:true,expansionRefusal:true,guardQualifiedError:true,getterNonexecution:true,receiptCopyIsolation:true,artifact:result.artifact};
}
