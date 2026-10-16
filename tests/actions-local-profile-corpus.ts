import type * as API from '../src/index';
import type {Document} from '../src/model/types';
import type {PortableActionPlan,ActionPlanInspectionContext} from '../src/extensions/actions/plan-types';
import model from '../docs/helix/03-test/fixtures/bulk-update/local-products-model.json';
import {sha256Text} from '../src/extensions/actions/plan-artifacts';
import {corpusCapabilities} from './actions-plan-corpus';
const artifact=(v:unknown)=>{const utf8=typeof v==='string'?v:JSON.stringify(v);return {mediaType:'application/json',utf8,sha256:sha256Text(utf8)};};
/** Hand-authored portable fixture; this is not a Weft compilation or native permission. */
export function localPlanFixture(api:typeof API){
 const document=JSON.parse(JSON.stringify(model)) as Document,original=artifact(document),pin={documentId:document.id,revision:original.sha256,umfVersion:'0.8.0' as const,sha256:original.sha256},action={identity:{module:'sales',action:'set-name-local'},documentSha256:original.sha256,invocation:{id:'umf.actions.local-tx',version:'1'}};
 const dependencies=[{module:'sales',element:'product-id'},{module:'sales',element:'product-name'}];
 const context:ActionPlanInspectionContext={registry:api.createUmfRegistry(),models:[{pin,artifact:original}],actions:[{pin:action,artifact:original}],selections:[{profile:{id:'fixture.selection',version:'1'},inspect:()=>({eligible:true,dependencies,diagnostics:[]})}]};
 const plan:PortableActionPlan={protocol:'umf.actions.plan/1',model:pin,action,target:{module:'sales',element:'products',key:'pk'},source:artifact({sql:"UPDATE products SET name='Foo' WHERE id='bar'"}),selection:{profile:{id:'fixture.selection',version:'1'},artifact:artifact({fixtureOnly:true}),dependencies},inputs:{entityParameter:'products',assignments:[{input:'name-value',field:dependencies[1]!,value:{string:'Foo'}}]},execution:{selection:'frozen',atomicity:'batch',conflict:'stop',partition:'manifest-order',batchSize:2},limits:{maxItems:10000,maxManifestBytes:16777216}};
 return {document,original,pin,action,context,plan};
}
export function localCapabilities(api:typeof API,s:ReturnType<typeof localPlanFixture>){const caps=corpusCapabilities(api,s);caps.bulk.profile.id='umf.actions.local-bulk';caps.bulk.claims=caps.bulk.claims.map(c=>({...c,id:c.id==='bulk.principal'?'bulk.localOwner':c.id}));return caps;}
export function runLocalProfileCorpus(api:typeof API){
 const f=localPlanFixture(api),preparation=api.prepareActionPlanModel(f.pin,f.action,f.context),inspection=api.inspectActionPlan(artifact(f.plan),f.context),caps=localCapabilities(api,f),assessment=api.assessActionPlan(inspection,caps,f.context);
 if(!inspection.eligible||!assessment.compatible||assessment.executionVerified||!assessment.obligations.some(o=>o.id==='bulk.localOwner')||assessment.obligations.some(o=>o.id==='bulk.principal'))throw Error('Local bundle/companion meaning mismatch');
 const result=api.constructActionManifest({plan:artifact(f.plan),action:{target:{...f.action.identity,revision:'local-r1'},documentSha256:f.pin.sha256,invocation:f.action.invocation},basis:{profile:{id:'fixture.snapshot',version:'1'},store:'local-test',epoch:'epoch1',cut:'cut1',selectionSha256:f.plan.selection.artifact.sha256},rows:['bar','baz','qux'].map((id,i)=>{const entity={key:f.plan.target,components:[{string:id}]};return {entity,guard:{profile:{id:'fixture.guard',version:'1'},store:'local-test',epoch:'epoch1',identity:String(i+1),version:'v1'},keyReceipt:api.encodeCoreKeyTuple(f.document,entity.key,entity.components)};})},f.context);
 const body=JSON.parse(result.artifact.utf8);if(result.sealed||result.authority||body.action.invocation.id!=='umf.actions.local-tx'||body.batches[0].count!==2||body.batches[1].count!==1)throw Error('Local manifest/original partition mismatch');
 let refusals=0;for(const mutate of [(c:any)=>c.bulk.profile.id='umf.actions.bulk',(c:any)=>c.bulk.claims=c.bulk.claims.map((x:any)=>({...x,id:x.id==='bulk.localOwner'?'bulk.principal':x.id})),(c:any)=>c.bulk.profile.version='2']){const c=JSON.parse(JSON.stringify(caps));mutate(c);if(api.assessActionPlan(inspection,c,f.context).compatible)throw Error('Mixed local/native bulk claims accepted');refusals++;}
 const mixed=localPlanFixture(api);mixed.action.invocation.id='umf.actions.tx';let refused=false;try{api.prepareActionPlanModel(mixed.pin,mixed.action,mixed.context);}catch{refused=true;}if(!refused)throw Error('Local action accepted as native tx1');
 return {prepared:JSON.parse(preparation.utf8).action.invocation.id,localOwner:true,executionVerified:false,unsealed:true,batches:body.batches.map((b:any)=>b.count),refusals:refusals+1};
}
