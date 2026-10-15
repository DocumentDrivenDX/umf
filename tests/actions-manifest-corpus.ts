import type * as API from '../src/index';
import {createPlanCorpusFixture,corpusCapabilities} from './actions-plan-corpus';
import {sha256Text} from '../src/extensions/actions/plan-artifacts';
const artifact=(value:unknown)=>{const utf8=typeof value==='string'?value:JSON.stringify(value);return {mediaType:'application/json',utf8,sha256:sha256Text(utf8,16777216)};};
export function createManifestCorpusFixture(api:typeof API){const s=createPlanCorpusFixture(api),plan=artifact(s.plan),body={protocol:'umf.actions.manifest/1' as const,plan,action:{target:{...s.action.identity,revision:'native-r1'},documentSha256:s.pin.sha256,invocation:s.action.invocation},basis:{profile:{id:'fixture.snapshot',version:'1'},store:'fixture',epoch:'e1',cut:'cut1',selectionSha256:s.plan.selection.artifact.sha256},items:['2','10','11'].map((id,ordinal)=>{const entity={key:s.plan.target,components:[{string:'c'+id}]};return {ordinal,entity,guard:{profile:{id:'fixture.guard',version:'1'},store:'fixture',epoch:'e1',identity:id,version:'v'+id},inputs:{customer:entity,'active-value':{boolean:false}},expectedVersions:[{frame:'customer-write',version:'v'+id}]};}),batches:[{ordinal:0,start:0,count:2},{ordinal:1,start:2,count:1}]};return {...s,body};}
export function manifestCases(){
 const cases:[string,(s:ReturnType<typeof createManifestCorpusFixture>)=>void,string|null][]=[
 ['valid',()=>{},null],['large-opaque-metadata',s=>{(s.body as any).annotations={nodes:Array.from({length:100001},()=>null)};},null],['empty',s=>{s.body.items=[];s.body.batches=[];},null],
 ['underfilled',s=>{s.body.batches=[{ordinal:0,start:0,count:1},{ordinal:1,start:1,count:2}];},'PAP_INVALID'],
 ['missing-batch',s=>{s.body.batches.pop();},'PAP_INVALID'],['ordinal',s=>{s.body.items[1]!.ordinal=2;},'PAP_INVALID'],
 ['duplicate-identity',s=>{s.body.items[1]!.guard.identity='2';},'PAP_SELECTION'],['duplicate-key',s=>{s.body.items[1]!.entity.components=[{string:'c2'}];},'PAP_SELECTION'],
 ['scope',s=>{s.body.items[0]!.guard.epoch='other';},'PAP_GUARD'],['version',s=>{s.body.items[0]!.expectedVersions[0]!.version='other';},'PAP_GUARD'],
 ['missing-frame',s=>{s.body.items[0]!.expectedVersions=[];},'PAP_INVALID'],['constant',s=>{s.body.items[0]!.inputs['active-value']={boolean:true};},'PAP_ACTION'],
 ['selection-digest',s=>{s.body.basis.selectionSha256='0'.repeat(64);},'PAP_INTEGRITY'],['action-digest',s=>{s.body.action.documentSha256='0'.repeat(64);},'PAP_ACTION'],
 ['future-member',s=>{(s.body.items[0]!.guard as any).future={retained:true};},'PAP_UNKNOWN'],['annotations',s=>{(s.body as any).annotations={future:'opaque'};},null],
 ['item-limit',s=>{s.plan.limits.maxItems=2;s.body.plan=artifact(s.plan);},'PAP_LIMIT'],
 ['input-extra',s=>{(s.body.items[0]!.inputs as any).extra={boolean:false};},'PAP_ACTION'],['different-guard-profile',s=>{s.body.items[1]!.guard.profile.id='other';},'PAP_PROFILE']
 ];
 return cases;
}
export function manifestOracleCases(api:typeof API){return manifestCases().map(([id,mutate,code])=>{const s=createManifestCorpusFixture(api);mutate(s);return {id,manifest:artifact(s.body),model:s.original,expectedEligible:code===null};});}
export function runManifestCorpus(api:typeof API){
 const cases=manifestCases();
 const results=[];
 for(const [id,mutate,code] of cases){const s=createManifestCorpusFixture(api);mutate(s);const source=artifact(s.body),inspection=api.inspectActionManifest(source,s.context);if(inspection.eligible!==(code===null)||code&&!inspection.diagnostics.some(d=>d.code===code)||inspection.source.utf8!==source.utf8)throw Error('Independent manifest expectation failed: '+id);results.push({id,eligible:inspection.eligible,codes:inspection.diagnostics.map(d=>d.code),sourceRetained:true});}
 const malformed=createManifestCorpusFixture(api),mc=corpusCapabilities(api,malformed);delete (mc as any).snapshot;const ma=api.assessActionManifest(api.inspectActionManifest(artifact(malformed.body),malformed.context),mc,malformed.context);if(ma.compatible)throw Error('Malformed capability admitted');results.push({id:'malformed-capabilities',compatible:false});
 const s=createManifestCorpusFixture(api),inspection=api.inspectActionManifest(artifact(s.body),s.context),assessment=api.assessActionManifest(inspection,corpusCapabilities(api,s),s.context);if(!assessment.compatible||assessment.executionVerified)throw Error('Manifest false attestation');results.push({id:'assessment',compatible:assessment.compatible,executionVerified:assessment.executionVerified});
 const bad=artifact(s.body);bad.sha256='0'.repeat(64);const refused=api.inspectActionManifest(bad,s.context);if(refused.eligible||refused.diagnostics[0]?.code!=='PAP_INTEGRITY')throw Error('Digest refusal missing');results.push({id:'tampered-artifact',eligible:false,codes:refused.diagnostics.map(d=>d.code),sourceRetained:refused.source.utf8===bad.utf8});
 const job={namespace:'owned',id:'j1'},manifest={protocol:'umf.actions.manifest/1',sha256:artifact(s.body).sha256},state={status:'queued',job,manifest,nextBatch:0,committedBatches:0,unresolvedBatch:null,stop:null};
 for(const operation of ['submit','claim','cancel','reconcile','materialize']){for(const status of ['indeterminate','failed']){const value={status,recovery:{id:'attempt1',operation},...(status==='failed'?{code:'PAP_CONTROL_NONCOMMIT'}:{})};const result=api.validateBulkOutcome(artifact(value));if(!result.valid)throw Error('Complete control result refused');results.push({id:operation+'-'+status,valid:result.valid});}}
 for(const status of ['stopped','cancelled','reconciling']){const value={status:'submitted',state:{...state,status,stop:status==='stopped'?{batch:0,code:'NATIVE_ABORT'}:null,unresolvedBatch:status==='reconciling'?0:null}};if(!api.validateBulkOutcome(artifact(value)).valid)throw Error('Retained sampled submission state refused');results.push({id:'submitted-'+status,valid:true});}
 const receipt={store:'fixture',epoch:'e1',version:'opaque'},committed={status:'committed',revision:s.body.action.target,outputs:{},changes:[],version:'opaque',receipt,noOp:true,verification:{kind:'recipe',effects:[{effect:'effect1',status:'verified',outcome:'no-op'}],postconditions:[],frames:'enforced',constraints:'verified'}};
 const outcome={status:'committed',job,batch:0,manifest,items:[{ordinal:0,result:committed}],receipt};if(!api.validateBulkOutcome(artifact(outcome)).valid)throw Error('Original complete committed result refused');results.push({id:'batch-complete-committed',valid:true});delete (committed as any).verification;if(api.validateBulkOutcome(artifact(outcome)).valid)throw Error('Incomplete committed result admitted');results.push({id:'batch-missing-verification',valid:false});
 for(const c of bulkOracleCases(api)){const checked=api.validateBulkOutcome(c.outcome);if(checked.valid!==c.expectedValid)throw Error('Independent bulk oracle failed: '+c.id);results.push({id:'oracle-'+c.id,valid:checked.valid});}
 // Exercise the public large-carrier entrypoints, beyond the plan's 1MiB limit.
 for(const [token,eligible] of [['0.0',true],['0e0',true],['1.00000000000000000000000001',false],['1e-9999',false],['9007199254740993',false],['-0',false]] as const){
 const s=createManifestCorpusFixture(api);(s.body as any).annotations={padding:'x'.repeat(1048576)};
 const originalOrdinal=token.startsWith('1.')?1:0;
 const text=JSON.stringify(s.body).replace('"ordinal":'+originalOrdinal,'"ordinal":'+token),source=artifact(text);
 const result=api.inspectActionManifest(source,s.context);
 if(result.eligible!==eligible||result.source.utf8!==text)throw Error('Public manifest numeric framing failed: '+token);
 results.push({id:'manifest-numeric-framing-'+token,eligible:result.eligible,sourceRetained:true});
 const claim={status:'claimed',job:{namespace:'owned',id:'j1'},batch:0,fence:'1',leaseUntil:'opaque-deadline'};
 const outcome=api.validateBulkOutcome(artifact(JSON.stringify(claim).replace('"batch":0','"batch":'+token)));
 if(outcome.valid!==eligible)throw Error('Public bulk numeric framing failed: '+token);
 results.push({id:'bulk-numeric-framing-'+token,valid:outcome.valid});
 }
 for(const [token,valid] of [['0.0',true],['1e-9999',false]] as const){
 const result={status:'committed',revision:s.body.action.target,outputs:{padding:{string:'x'.repeat(1048576)}},changes:[],version:'v',receipt,noOp:true,verification:{kind:'handler',deployment:{id:'fixture',version:'1',build:'fixture'},postconditions:[],frames:'enforced',constraints:'verified',outputs:'verified'}};
 const value={status:'committed',job,batch:0,manifest,items:[{ordinal:0,result}],receipt};
 const text=JSON.stringify(value).replace('"batch":0','"batch":'+token);
 const checked=api.validateBulkOutcome(artifact(text));
 if(checked.valid!==valid)throw Error('Public large bulk numeric framing failed: '+token);
 results.push({id:'large-bulk-numeric-framing-'+token,valid:checked.valid});
 }
 return results;
}
export function bulkOracleCases(api:typeof API){
 const s=createManifestCorpusFixture(api),job={namespace:'owned',id:'j1'},manifest={protocol:'umf.actions.manifest/1',sha256:artifact(s.body).sha256},receipt={store:'fixture',epoch:'e1',version:'opaque'};
 const result={status:'committed',revision:s.body.action.target,outputs:{},changes:[],version:'opaque',receipt,noOp:true,verification:{kind:'recipe',effects:[{effect:'effect1',status:'verified',outcome:'no-op'}],postconditions:[],frames:'enforced',constraints:'verified'}};
 const committed={status:'committed',job,batch:0,manifest,items:[{ordinal:0,result}],receipt};
 const state={status:'queued',job,manifest,nextBatch:0,committedBatches:0,unresolvedBatch:null,stop:null};
 const cases:[string,unknown,boolean][]=[['complete-committed',committed,true],['partial-committed',{...committed,items:[{ordinal:0,result:{...result,verification:undefined}}]},false],['false-noop',{...committed,items:[{ordinal:0,result:{...result,noOp:false}}]},false],['protected-refusal',{status:'denied',code:'AUTHORIZATION',secret:'hidden'},false],['control-unknown',{status:'indeterminate',recovery:{id:'a1',operation:'submit'}},true],['control-failure',{status:'failed',code:'PAP_CONTROL_NONCOMMIT',recovery:{id:'a1',operation:'submit'}},true],['wrong-recovery-operation',{status:'indeterminate',recovery:{id:'a1',operation:'execute'}},false],['stopped',{...state,status:'stopped',stop:{batch:0,code:'NATIVE_ABORT'}},true],['missing-stop',{...state,status:'stopped'},false],['cancelled-uncertain',{...state,status:'cancelled',unresolvedBatch:0},false]];
 const handler=JSON.parse(JSON.stringify(result));handler.verification={kind:'handler',deployment:{id:'d',version:'1',build:'b'},postconditions:[],frames:'enforced',constraints:'verified',outputs:'verified'};handler.outputs={entity:JSON.parse(JSON.stringify(s.body.items[0]!.entity))};
 const outputCase=(id:string,mutate:(value:any)=>void,expected:boolean)=>{const next=JSON.parse(JSON.stringify(handler));mutate(next);cases.push([id,{...committed,items:[{ordinal:0,result:next}]},expected]);};
 outputCase('future-output',r=>{r.outputs.entity.future={privilege:true};},false);
 outputCase('output-id-utf16',r=>{r.outputs={['😀'.repeat(129)]:{boolean:false}};},false);
 outputCase('output-key-utf16',r=>{r.outputs.entity.key.module='😀'.repeat(129);},false);
 outputCase('map-literal-business-key',r=>{r.outputs={out:{map:{['x'.repeat(257)]:{string:'value'}}}};},true);
 outputCase('array-literal',r=>{r.outputs={out:{array:[{string:'x'}]}};},true);
 outputCase('outputs128',r=>{r.outputs=Object.fromEntries(Array.from({length:128},(_,i)=>['out'+i,{boolean:false}]));},true);
 outputCase('outputs129',r=>{r.outputs=Object.fromEntries(Array.from({length:129},(_,i)=>['out'+i,{boolean:false}]));},false);
 for(const count of [256,257]){const recipe=JSON.parse(JSON.stringify(result));recipe.verification.effects=Array.from({length:count},(_,i)=>({effect:'e'+i,status:'verified',outcome:'no-op'}));cases.push(['effects'+count,{...committed,items:[{ordinal:0,result:recipe}]},count===256]);}
 const recipeCase=(id:string,mutate:(value:any)=>void,expected:boolean)=>{const next=JSON.parse(JSON.stringify(committed));mutate(next);cases.push([id,next,expected]);};
 recipeCase('recipe-outputs',v=>{v.items[0].result.outputs.out={boolean:false};},false);
 recipeCase('empty-effects',v=>{v.items[0].result.verification.effects=[];},false);
 recipeCase('duplicate-effects',v=>{v.items[0].result.verification.effects.push({effect:'effect1',status:'verified',outcome:'changed'});},false);
 recipeCase('duplicate-conditions',v=>{v.items[0].result.verification.postconditions=[{condition:'p',status:'satisfied'},{condition:'p',status:'satisfied'}];},false);
 recipeCase('ordered-item-vector',v=>{v.items=[{ordinal:2,result:v.items[0].result},{ordinal:3,result:JSON.parse(JSON.stringify(v.items[0].result))}];},true);
 recipeCase('duplicate-item-vector',v=>{v.items.push(JSON.parse(JSON.stringify(v.items[0])));},false);
 recipeCase('gapped-item-vector',v=>{v.items.push({ordinal:2,result:JSON.parse(JSON.stringify(v.items[0].result))});},false);
 const sealed=artifact(s.body);cases.push(['sealed-artifact',{status:'sealed',manifest:sealed},true],['sealed-tampered',{status:'sealed',manifest:{...sealed,sha256:'0'.repeat(64)}},false]);
 return cases.map(([id,value,expectedValid])=>({id,outcome:artifact(value),expectedValid}));
}
