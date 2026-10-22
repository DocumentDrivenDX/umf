import * as api from '/Users/erik/.codex/worktrees/security-action-source-custody/umf/src/index.ts';
import {localPlanFixture,localCapabilities} from '/Users/erik/.codex/worktrees/security-action-source-custody/umf/tests/actions-local-profile-corpus.ts';
import {sha256Text} from '/Users/erik/.codex/worktrees/security-action-source-custody/umf/src/extensions/actions/plan-artifacts.ts';
const artifact=(v:any)=>{const utf8=JSON.stringify(v);return {mediaType:'application/json',utf8,sha256:sha256Text(utf8)}};
const act=(f:any)=>f.document.modules[0].extensions['umf.actions'].actions[0];
const refresh=(f:any)=>{const a=artifact(f.document);f.pin.sha256=a.sha256;f.action.documentSha256=a.sha256;f.context.models[0].artifact=a;f.context.actions[0].artifact=a;};
const controls:{name:string;passed:boolean}[]=[];
const check=(ok:boolean,name:string)=>{if(!ok)throw Error(name);controls.push({name,passed:true});};
const actors:any[]=[{subject:'actor-profile',profile:{id:'umf.actions.local-owner',version:'1'}},{subject:'person-required'},{subject:'actor-profile',profile:{id:'other.actor',version:'1'}}];
const policies:any[]=[{kind:'policy',profile:{id:'umf.actions.local-store-owner',version:'1'},resources:['customer-write']},{kind:'roles',profile:{id:'umf.actions.roles',version:'1'},roles:['bulk-editor']},{kind:'policy',profile:{id:'other.policy',version:'1'},resources:['customer-write']}];
for(let a=0;a<3;a++)for(let p=0;p<3;p++)for(let v=0;v<3;v++){
 const f=localPlanFixture(api);act(f).attribution=structuredClone(actors[a]);act(f).authorization=structuredClone(policies[p]);f.action.invocation.id=['umf.actions.local-tx','umf.actions.tx','other.invoke'][v]!;refresh(f);
 let accepted=true;try{api.prepareActionPlanModel(f.pin,f.action,f.context);}catch{accepted=false;}
 check(accepted===(a===0&&p===0&&v===0||a===1&&p===1&&v===1),`combination ${a}/${p}/${v}`);
}
for(const entry of ['actor-profile-extra','policy-profile-extra','actor-extra','policy-extra','action-extra']){
 const f=localPlanFixture(api);const action=act(f),container=entry==='actor-profile-extra'?action.attribution.profile:entry==='policy-profile-extra'?action.authorization.profile:entry==='actor-extra'?action.attribution:entry==='policy-extra'?action.authorization:action;container.future={retain:'original'};refresh(f);
 const before=JSON.stringify(f.document),i=api.inspectActions(f.document,f.context.registry);check(JSON.stringify(i.source)===before&&JSON.stringify(f.document)===before,entry+' retained');check(i.actions[0]!.obligations.some(o=>o.kind==='unknown'&&o.status==='unchecked'),entry+' unknown');let refused=false;try{api.prepareActionPlanModel(f.pin,f.action,f.context);}catch{refused=true;}check(refused,entry+' preparation');
}
for(const mode of ['valid','reversed','omitted','duplicate']){
 const f=localPlanFixture(api),action=act(f);const r=structuredClone(action.writes[0]);r.id='product-read';action.reads=[r];action.authorization.resources=['product-read','customer-write'];if(mode==='reversed')action.authorization.resources.reverse();if(mode==='omitted')action.authorization.resources.pop();if(mode==='duplicate')action.authorization.resources=['product-read','product-read'];refresh(f);let accepted=true;try{api.prepareActionPlanModel(f.pin,f.action,f.context);}catch{accepted=false;}check(accepted===(mode==='valid'),'resource '+mode);
}
for(const location of ['attribution','authorization','actor-profile','policy-profile','resource']){
 const f=localPlanFixture(api),action=act(f);let calls=0;const target=location==='actor-profile'?action.attribution:location==='policy-profile'?action.authorization:location==='resource'?action.authorization.resources:action,key=location==='actor-profile'||location==='policy-profile'?'profile':location==='resource'?'0':location;Object.defineProperty(target,key,{enumerable:true,get(){calls++;throw Error('getter');}});let refused=false;try{api.inspectActions(f.document,f.context.registry);}catch{refused=true;}check(refused&&calls===0,'getter '+location);
}
for(const mode of ['missing','duplicate','unknown','extra','unsupported','empty-evidence','future-profile']){
 const f=localPlanFixture(api),i=api.inspectActionPlan(artifact(f.plan),f.context),c=localCapabilities(api,f);if(mode==='missing')c.bulk.claims.pop();if(mode==='duplicate')c.bulk.claims.push(c.bulk.claims[0]!);if(mode==='unknown')c.bulk.claims[0]!.id='bulk.future';if(mode==='extra')c.bulk.claims.push({id:'bulk.principal',status:'supported',evidence:['x']});if(mode==='unsupported')c.bulk.claims[0]!.status='unsupported';if(mode==='empty-evidence')c.bulk.claims[0]!.evidence=[];if(mode==='future-profile')(c.bulk.profile as any).future=true;check(!api.assessActionPlan(i,c,f.context).compatible,'capability '+mode);
}
const result={status:'passed',runtime:'Bun '+Bun.version,scope:'Portable original UMF declaration APIs; independent expected decisions using shared input fixture only. No independent browser/native execution.',controlCount:controls.length,groups:{matrix:27,unknownRetention:15,resourceOrder:4,getters:5,capabilities:7},controls};
await Bun.write(new URL('./independent-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,controls:controls.length}));
