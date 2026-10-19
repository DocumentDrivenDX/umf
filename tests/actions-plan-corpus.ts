// SPDX-License-Identifier: MIT OR Apache-2.0
import {CURRENT_CORE_VERSION} from '../src/generated/core-model';
import modelFixture from '../docs/helix/03-test/fixtures/bulk-update/model.json';
import {sha256Text} from '../src/extensions/actions/plan-artifacts';
import type * as API from '../src/index';
import type {Document} from '../src/model/types';
import type {ActionPlanArtifact,ActionPlanInspectionContext,PortableActionPlan,ActionPlanCapabilities} from '../src/extensions/actions/plan-types';
const copy=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
const artifact=(value:unknown):ActionPlanArtifact=>{const utf8=typeof value==='string'?value:JSON.stringify(value);return {mediaType:'application/json',utf8,sha256:sha256Text(utf8)};};
export function createPlanCorpusFixture(api:typeof API){
 const document=copy(modelFixture) as unknown as Document,original=artifact(document),pin={documentId:document.id,revision:'fixture1',umfVersion:CURRENT_CORE_VERSION,sha256:original.sha256};
 const action={identity:{module:'sales',action:'set-active'},documentSha256:original.sha256,invocation:{id:'umf.actions.tx',version:'1'}},field={module:'sales',element:'last-seen'},target={module:'sales',element:'customer',key:'pk'};
 const context:ActionPlanInspectionContext={registry:api.createUmfRegistry(),models:[{pin,artifact:original}],actions:[{pin:action,artifact:original}],selections:[{profile:{id:'fixture.selection',version:'1'},inspect:(a)=>{const ast=JSON.parse(a.utf8);return {eligible:ast.kind==='fixture'&&ast.field===field.element,dependencies:[field],diagnostics:[]};}}]};
 const plan:PortableActionPlan={protocol:'umf.actions.plan/1',model:pin,action,target,source:artifact({sql:'UPDATE Customer SET active=FALSE WHERE last_seen<100'}),selection:{profile:{id:'fixture.selection',version:'1'},artifact:artifact({kind:'fixture',field:field.element}),dependencies:[field]},inputs:{entityParameter:'customer',assignments:[{input:'active-value',field:{module:'sales',element:'active'},value:{boolean:false}}]},execution:{selection:'frozen',atomicity:'batch',conflict:'stop',partition:'manifest-order',batchSize:2},limits:{maxItems:10000,maxManifestBytes:16777216}};
 return {document,original,pin,action,context,plan};
}
export function corpusCapabilities(api:typeof API,s:ReturnType<typeof createPlanCorpusFixture>):ActionPlanCapabilities {
 const claims={plan:['integrity','actionBinding'],selection:['interpretation','completeRead'],manifest:['partition','sealCustody'],guard:['identityVersion'],snapshot:['coherentCut'],bulk:['atomicBatch','replay','principal','recovery','cancel','retention']};
 const caps:any={};for(const [family,ids] of Object.entries(claims))caps[family]={profile:{id:family==='selection'?'fixture.selection':family==='guard'||family==='snapshot'?'fixture.'+family:'umf.actions.'+family,version:'1'},claims:ids.map(id=>({id:family+'.'+id,status:'supported',evidence:['fixture://unverified']}))};
 caps.action={id:'fixture.executor',version:'1',coreVersion:CURRENT_CORE_VERSION,actionVersion:'0.1.0',source:s.document,identity:s.action.identity,claims:api.inspectActions(s.document,s.context.registry).actions[0]!.obligations.map(o=>({obligation:o.id,status:'supported',evidence:['fixture://unverified']}))};return caps;
}
/** Hand-authored expected refusals; parity is checked separately from these outcomes. */
export function runActionPlanCorpus(api:typeof API){
 const results:any[]=[];
 const cases:[string,(s:ReturnType<typeof createPlanCorpusFixture>)=>void,string|null][]=[
  ['valid',()=>{},null],['unknown-root',s=>{s.plan['future/~']={retained:['😀',null]};},'PAP_UNKNOWN'],
  ['opaque-annotations',s=>{s.plan.annotations={future:{opaque:['😀',null]}};},null],
  ['unknown-nested',s=>{s.plan.action.invocation.future=true;},'PAP_UNKNOWN'],
  ['wrong-input',s=>{s.plan.inputs.assignments[0]!.input='other';},'PAP_ACTION'],
  ['wrong-field',s=>{s.plan.inputs.assignments[0]!.field.element='customer-id';},'PAP_ACTION'],
  ['null-assignment',s=>{s.plan.inputs.assignments[0]!.value=null;},'PAP_ACTION'],
  ['wrong-literal-family',s=>{s.plan.inputs.assignments[0]!.value={integerToken:'1'};},'PAP_ACTION'],
  ['missing-selection-profile',s=>{s.context.selections=[];},'PAP_PROFILE'],
  ['duplicate-selection-profile',s=>{s.context.selections.push(s.context.selections[0]!);},'PAP_PROFILE'],
  ['wrong-dependencies',s=>{s.plan.selection.dependencies=[];},'PAP_ACTION'],
  ['selection-ineligible',s=>{s.plan.selection.artifact=artifact({kind:'not-understood',field:'last-seen'});},'PAP_PROFILE'],
  ['source-digest',s=>{s.plan.source.sha256='0'.repeat(64);},'PAP_INTEGRITY'],
  ['model-registration',s=>{s.context.models[0]!.pin={...s.pin,revision:'other'};},'PAP_INTEGRITY'],
  ['wrong-action',s=>{s.plan.action.identity={module:'sales',action:'missing'};},'PAP_ACTION'],
  ['wrong-invocation-version',s=>{s.action.invocation.version='99';},'PAP_PROFILE'],
  ['wrong-plan-version',s=>{(s.plan as any).protocol='umf.actions.plan/99';},'PAP_INVALID'],
  ['wrong-batch-bound',s=>{s.plan.execution.batchSize=101;},'PAP_INVALID'],
 ];
 for(const [id,mutate,expected] of cases){const s=createPlanCorpusFixture(api);mutate(s);const a=artifact(s.plan),result=api.inspectActionPlan(a,s.context);if(result.eligible!==(expected===null)||expected&&!result.diagnostics.some(d=>d.code===expected)||result.source.utf8!==a.utf8)throw Error('Independent plan expectation failed: '+id);results.push({id,eligible:result.eligible,codes:result.diagnostics.map(d=>d.code),sourceRetained:result.source.utf8===a.utf8});}
 for(const [id,text,code] of [['duplicate-members','{"x":1,"x":2}','PAP_INVALID'],['escaped-duplicate','{"a":1,"\\u0061":2}','PAP_INVALID'],['surrogate','{"x":"\\ud800"}','PAP_INVALID'],['depth64','{"x":'+'['.repeat(65)+'0'+']'.repeat(65)+'}','PAP_LIMIT']] as const){const s=createPlanCorpusFixture(api),result=api.inspectActionPlan(artifact(text),s.context);if(result.eligible||!result.diagnostics.some(d=>d.code===code))throw Error('Independent strict JSON expectation failed: '+id);results.push({id,eligible:result.eligible,codes:result.diagnostics.map(d=>d.code)});}
 const s=createPlanCorpusFixture(api),i=api.inspectActionPlan(artifact(s.plan),s.context),caps=corpusCapabilities(api,s),assessment=api.assessActionPlan(i,caps,s.context);if(!assessment.compatible||assessment.executionVerified)throw Error('Assessment must remain unverified');results.push({id:'declared-capabilities',assessment});caps.bulk.claims[0]!.evidence=[];const refused=api.assessActionPlan(i,caps,s.context);if(refused.compatible)throw Error('Unsupported evidence was accepted');results.push({id:'missing-evidence',assessment:refused});
 const prepared=api.prepareActionPlanModel(s.pin,s.action,s.context),body=JSON.parse(prepared.utf8);if(body.assignments[0].input!=='active-value'||body.frames.join(',')!=='customer-write'||body.obligations.some((o:any)=>o.status!=='checked'))throw Error('Independent preparation binding expectation failed');results.push({id:'preparation',artifact:prepared});
 for(const key of ['models','actions','selections'] as const){const x=createPlanCorpusFixture(api);let calls=0;const slot=x.context[key][0];Object.defineProperty(x.context[key],'0',{get(){calls++;return slot;},enumerable:true});const refused=api.inspectActionPlan(artifact(x.plan),x.context);if(calls||refused.eligible)throw Error('Context accessor invoked');results.push({id:'accessor-'+key,eligible:refused.eligible,calls});}
 const unicode=createPlanCorpusFixture(api);unicode.pin.revision='\ud800';let rejected=false;try{api.prepareActionPlanModel(unicode.pin,unicode.action,unicode.context);}catch{rejected=true;}if(!rejected)throw Error('Unicode preparation admitted');results.push({id:'metadata-unicode',rejected});
 const diagnostic=createPlanCorpusFixture(api);diagnostic.context.selections[0]!.inspect=()=>({eligible:true,dependencies:diagnostic.plan.selection.dependencies,diagnostics:[{code:'x'.repeat(257),path:'',message:'test'}]});const dr=api.inspectActionPlan(artifact(diagnostic.plan),diagnostic.context);if(dr.eligible||dr.diagnostics[0]?.code!=='PAP_PROFILE')throw Error('Diagnostic overflow admitted');results.push({id:'diagnostic-code-bound',eligible:dr.eligible,codes:dr.diagnostics.map(d=>d.code)});
 const meta=createPlanCorpusFixture(api),mi=api.inspectActionPlan(artifact(meta.plan),meta.context),mc=corpusCapabilities(api,meta);mc.guard.profile.id='\ud800';const ma=api.assessActionPlan(mi,mc,meta.context);if(ma.compatible)throw Error('Capability Unicode admitted');results.push({id:'capability-unicode',assessment:ma});
 const ec=corpusCapabilities(api,meta);ec.action.claims[0]!.evidence=Array.from({length:65},()=> 'fixture://evidence');const ea=api.assessActionPlan(mi,ec,meta.context);if(!ea.compatible||!ea.obligations.some(o=>o.evidence.length===65))throw Error('Original evidence lost');results.push({id:'original-evidence65',assessment:ea});
 for(const length of [256,257]){const f=createPlanCorpusFixture(api);(f.document.modules[0]!.extensions!['umf.actions'] as any).actions[0].writes[0].id='x'.repeat(length);const fa=artifact(f.document);f.pin.sha256=fa.sha256;f.action.documentSha256=fa.sha256;f.context.models[0]!.artifact=fa;f.context.actions[0]!.artifact=fa;const fi=api.inspectActionPlan(artifact(f.plan),f.context);let prepared=true;try{api.prepareActionPlanModel(f.pin,f.action,f.context);}catch{prepared=false;}if(fi.eligible!==(length===256)||prepared!==fi.eligible)throw Error('Frame boundary disagreement');results.push({id:'frame-id'+length,eligible:fi.eligible,prepared});}
 for(const depth of [64,65]){const d=createPlanCorpusFixture(api);let v:any=0;for(let i=0;i<depth-2;i++)v=[v];d.plan.annotations={x:v};const a=artifact(d.plan),di=api.inspectActionPlan(a,d.context);if(di.eligible!==(depth===64)||di.source.utf8!==a.utf8||depth===65&&!di.diagnostics.some(d=>d.code==='PAP_LIMIT'))throw Error('Exact raw depth failure');results.push({id:'raw-depth'+depth,eligible:di.eligible,codes:di.diagnostics.map(d=>d.code)});}
 for(const count of [128,129]){const d=createPlanCorpusFixture(api);d.context.selections[0]!.inspect=()=>({eligible:true,dependencies:d.plan.selection.dependencies,diagnostics:Array.from({length:count},()=>({code:'FIXTURE',path:'',message:'fixture'}))});const di=api.inspectActionPlan(artifact(d.plan),d.context);if(count===128&&di.diagnostics.length!==128||count===129&&!di.diagnostics.some(d=>d.code==='PAP_LIMIT'))throw Error('Exact diagnostic limit failure');results.push({id:'diagnostic-count'+count,count:di.diagnostics.length,codes:di.diagnostics.map(d=>d.code)});}
 for(const maximum of [100000,100001]){const n=createPlanCorpusFixture(api);n.plan.annotations={nodes:[]};const count=(v:any):number=>1+(v&&typeof v==='object'?Object.values(v).reduce<number>((sum,c)=>sum+count(c),0):0);(n.plan.annotations.nodes as null[]).push(...Array.from({length:maximum-count(n.plan)},()=>null));const ni=api.inspectActionPlan(artifact(n.plan),n.context);if(ni.eligible!==(maximum===100000)||maximum===100001&&!ni.diagnostics.some(d=>d.code==='PAP_LIMIT'))throw Error('Exact node bound failed');const assessed=maximum===100000?api.assessActionPlan(ni,corpusCapabilities(api,n),n.context):null;if(assessed&&!assessed.compatible)throw Error('Derived inspection node overhead refused');results.push({id:'json-nodes'+maximum,eligible:ni.eligible,codes:ni.diagnostics.map(d=>d.code),assessmentCompatible:assessed?.compatible??null});}
 for(const mode of ['reversed','duplicate','omitted','wrong-field']){
 const s=createPlanCorpusFixture(api),m=s.document.modules[0]!,record=m.elements.find(e=>e.id==='customer')!,a=(m.extensions!['umf.actions'] as any).actions[0];
 m.elements.push({id:'enabled',name:'enabled',kind:'field',scalarType:'boolean',cardinality:'one',nullability:'required',extensions:{}} as any);(record.members as any[]).push({module:'sales',element:'enabled'});
 a.parameters.push({id:'enabled-value',kind:'value',field:{module:'sales',element:'enabled'},required:true});a.binding.effects[0].values.push({field:{module:'sales',element:'enabled'},value:{parameter:'enabled-value'}});a.writes[0].fields.push({module:'sales',element:'enabled'});
 const original=artifact(s.document);s.pin.sha256=original.sha256;s.action.documentSha256=original.sha256;s.context.models[0]!.artifact=original;s.context.actions[0]!.artifact=original;
 const active=s.plan.inputs.assignments[0]!,enabled={input:'enabled-value',field:{module:'sales',element:'enabled'},value:{boolean:true}};
 s.plan.inputs.assignments=mode==='duplicate'?[active,active]:mode==='omitted'?[enabled]:mode==='wrong-field'?[{...enabled,field:active.field},active]:[enabled,active];
 const result=api.inspectActionPlan(artifact(s.plan),s.context);if(result.eligible!==(mode==='reversed'))throw Error('Assignment set failed: '+mode);if(result.eligible&&result.plan!.inputs.assignments[0]!.input!=='enabled-value')throw Error('Source order changed');results.push({id:'assignment-set-'+mode,eligible:result.eligible,codes:result.diagnostics.map(d=>d.code)});
 }
 // Public artifact framing must preserve numeric metadata before materialization.
 for(const [token,eligible] of [['8.0',true],['8e0',true],['8.0000000000000000000000000001',false],['1e-9999',false],['9007199254740993',false],['-0',false]] as const){
 const s=createPlanCorpusFixture(api);s.plan.annotations={number:8};
 const source=artifact(JSON.stringify(s.plan).replace('"number":8','"number":'+token));
 const result=api.inspectActionPlan(source,s.context);
 if(result.eligible!==eligible||result.source.utf8!==source.utf8)throw Error('Public plan numeric framing failed: '+token);
 results.push({id:'numeric-framing-'+token,eligible:result.eligible,sourceRetained:true});
 }
 return results;
}
