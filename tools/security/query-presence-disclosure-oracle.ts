/** Actual atomic producer handoff on explicit optional source. @covers US-056-AC6 @covers US-056-AC10 */
import {createHash} from 'node:crypto';
import {resolve,relative,dirname,extname} from 'node:path';
import {mkdir} from 'node:fs/promises';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogReadDisclosureBatchWithinOperation as produce} from '../../src/extensions/security/catalog-runtime-candidate';
import {CandidateSecurityOperationBudget} from '../../src/extensions/security/operation-budget-candidate';
import {inspectSecurityDisclosureV2,encodeSecurityDisclosureV2,decodeSecurityDisclosureV2} from '../../src/extensions/security/protection/disclosure';
const output=process.argv[2];
if(!output||await Bun.file(output).exists())throw Error('Fresh output directory required');
await mkdir(output,{recursive:false});
const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const canonical=(x:any):string=>x&&typeof x==='object'?Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}':JSON.stringify(x);
const sources=new Map<string,string>();
async function capture(path:string):Promise<void>{
 path=resolve(path);const key=relative(process.cwd(),path);
 if(key==='..'||key.startsWith('../'))throw Error('Source escaped repository');
 if(sources.has(key))return;if(sources.size>=4096)throw Error('Source closure bound');
 const text=await Bun.file(path).text();sources.set(key,text);if(!['.ts','.js'].includes(extname(path)))return;
 for(const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
  const base=resolve(dirname(path),match[1]!);let found:string|undefined;
  for(const candidate of [base,base+'.ts',base+'.json',resolve(base,'index.ts')])if(await Bun.file(candidate).exists()){found=candidate;break;}
  if(!found)throw Error('Unresolved import '+match[1]);await capture(found);
 }
}
await capture(import.meta.path);
for(const path of ['tests/security/protection/current-query-presence-source.json','tests/security/protection/current-query-read-scenarios.json','package.json','bun.lock',Bun.resolveSync('ajv/package.json',process.cwd())])await capture(path);
const source=JSON.parse(sources.get('tests/security/protection/current-query-presence-source.json')!);
const scenarios=JSON.parse(sources.get('tests/security/protection/current-query-read-scenarios.json')!);
const ref=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
const controls:{id:string;passed:boolean}[]=[],packets:any[]=[];
function check(id:string,left:any,right:any){const passed=canonical(left)===canonical(right);controls.push({id,passed});if(!passed)throw Error(id+': '+canonical(left)+' != '+canonical(right));}
const variants=['allowed','undisclosed','revoked','foreign-subject','foreign-assignment-staff','foreign-assignment-project','foreign-ownership-project','no-ownership','no-assignment','incomplete-coverage','stale-generation'];
for(const variant of variants)for(const state of ['string','null','absent','withheld','transformed-null','unreported']){
 const id=variant+':'+state,policy=structuredClone(source.policy),catalog=structuredClone(source.catalog),owner=structuredClone(source.owner),ontology=structuredClone(source.ontology),closure=structuredClone(source.closure);
 if(variant!=='undisclosed'){
  policy.revision='atomic-presence-token-'+(state==='withheld'?'withheld':state==='transformed-null'?'null-presentation':'original')+'-r1';
  const disposition=state==='withheld'?{kind:'withheld'}:state==='transformed-null'?{kind:'transformed',vocabulary:'umf.security.protection',transform:'presentation-null',version:'1',field:ref('token')}:{kind:'original'};
  policy.rules[0].disclosure.push({field:ref('token'),disposition});
 }
 if(state==='transformed-null'&&variant!=='undisclosed'){
  catalog.revision='atomic-presence-null-presentation-r1';
  catalog.transforms.push({id:'presentation-null',version:'1',kind:'mask',function:'null-out',inputDomain:ref('token'),outputDomain:ref('token'),determinism:'deterministic',reversibility:'none',disclosureProfile:[],queryUse:{},parameters:[]});
  policy.protection={id:catalog.id,revision:catalog.revision};
 }
 owner.revision='atomic-presence-owner-r1';owner.disclosure={readAction:'read'};
 const cut=structuredClone(scenarios.cut);cut.generation=cut.expectedGeneration='atomic-presence-supplied-cut-r1';cut.policy={id:policy.id,revision:policy.revision};cut.ontology={documentId:ontology.documentId,revision:ontology.revision};cut.protection={id:catalog.id,revision:catalog.revision};cut.domains=closure.pins;cut.owner={id:owner.id,revision:owner.revision};
 const fact=cut.facts.find((f:any)=>f.type.elementId==='Resource');fact.fields=fact.fields.filter((f:any)=>f.field.elementId!=='token');fact.absent=[];
 if(state==='absent')fact.absent.push(ref('token'));
 else if(state!=='unreported'&&state!=='withheld')fact.fields.push({field:ref('token'),value:state==='null'?null:{string:'opaque-token'}});
 if(state==='withheld')cut.coverage.find((f:any)=>f.type.elementId==='Resource').fields=cut.coverage.find((f:any)=>f.type.elementId==='Resource').fields.filter((f:any)=>f.elementId!=='token');
 if(variant==='revoked')cut.facts.find((f:any)=>f.type.elementId==='Assignment').fields.find((f:any)=>f.field.elementId==='active').value={boolean:false};
 const addIdentity=(type:string,idField:string,value:string)=>{const f=structuredClone(cut.facts.find((f:any)=>f.type.elementId===type));f.key=[{string:value}];f.fields=[{field:ref(idField),value:{string:value}}];cut.facts.push(f);};
 if(variant==='foreign-subject'||variant==='foreign-assignment-staff')addIdentity('Staff','staffId','bob');
 if(variant==='foreign-subject')cut.subject.key=[{string:'bob'}];
 if(variant==='foreign-assignment-staff')cut.facts.find((f:any)=>f.type.elementId==='Assignment').fields.find((f:any)=>f.field.elementId==='assignmentStaff').value={string:'bob'};
 if(variant==='foreign-assignment-project'||variant==='foreign-ownership-project')addIdentity('Project','projectId','p2');
 if(variant==='foreign-assignment-project')cut.facts.find((f:any)=>f.type.elementId==='Assignment').fields.find((f:any)=>f.field.elementId==='assignmentProject').value={string:'p2'};
 if(variant==='foreign-ownership-project')cut.facts.find((f:any)=>f.type.elementId==='Ownership').fields.find((f:any)=>f.field.elementId==='ownerProject').value={string:'p2'};
 if(variant==='no-ownership')cut.facts=cut.facts.filter((f:any)=>f.type.elementId!=='Ownership');
 if(variant==='no-assignment')cut.facts=cut.facts.filter((f:any)=>f.type.elementId==='Assignment'?false:true);
 if(variant==='incomplete-coverage')cut.coverage.find((f:any)=>f.type.elementId==='Resource').fields=cut.coverage.find((f:any)=>f.type.elementId==='Resource').fields.filter((f:any)=>f.elementId!=='token');
 if(variant==='stale-generation')cut.expectedGeneration='other';
 const handle=compileCandidateCatalogProgram(policy,catalog,closure,ontology);
 const result=produce(handle,owner,cut,{type:ref('Resource'),fields:[ref('token')]},new CandidateSecurityOperationBudget(100000));
 const shouldRender=state!=='unreported'&&!['undisclosed','stale-generation'].includes(variant)&&(variant!=='incomplete-coverage'||state==='withheld');
 let inspection:ReturnType<typeof inspectSecurityDisclosureV2>|null=null;const encoded:Partial<Record<'json'|'yaml',string>>={};
 check(id+':status',result.status,shouldRender?'rendered':'refused');check(id+':authority',[result.complete,result.authority],[false,false]);
 if(!shouldRender)check(id+':atomic-refusal',result,{version:'umf.security.logical-disclosure-batch/0.1-candidate',status:'refused',complete:false,authority:false,sources:null,decisions:[],resources:[],batch:null});
 else{
  const permitted=variant==='allowed'||variant==='incomplete-coverage';
  check(id+':selection',result.decisions.map(d=>[d.resource,d.decision]),[[{type:ref('Resource'),key:[{string:'r1'}]},permitted?'permit':'deny']]);
  check(id+':resource-row-correspondence',result.resources,permitted?[{type:ref('Resource'),key:[{string:'r1'}]}]:[]);
  inspection=inspectSecurityDisclosureV2(result.batch,policy,catalog,closure);check(id+':public-inspection',inspection.status,'validated-disclosure');
  for(const format of ['json','yaml'] as const){encoded[format]=encodeSecurityDisclosureV2(result.batch,policy,catalog,closure,format);check(id+':'+format,decodeSecurityDisclosureV2(encoded[format]!,policy,catalog,closure,format),result.batch);}
  const expected=state==='withheld'?{disposition:'withheld'}:state==='absent'?{disposition:'absent'}:state==='transformed-null'?{disposition:'transformed',value:null,selection:{ruleIndex:0,disclosureIndex:1},outputDomain:ref('token'),transform:{id:'presentation-null',version:'1'}}:{disposition:'original',value:state==='null'?null:{string:'opaque-token'}};
  check(id+':cells',result.batch!.rows,permitted?[[expected]]:[]);
  check(id+':stored-carrier',result.batch!.columns,[{field:ref('token'),storageEffect:'stored-transformed',storageTransform:{id:'vault',version:'1'}}]);
 }
 const sourceBytes=Object.fromEntries(Object.entries({policy,catalog,owner,ontology}).map(([role,value])=>{const utf8=JSON.stringify(value);return [role,{utf8,sha256:sha(utf8)}];}));
 packets.push({id,variant,state,source:{policy,catalog,owner,ontology,closure},sourceBytes,cut,selection:{type:ref('Resource'),fields:[ref('token')]},operationBudgetMaxSteps:100000,result,inspection,encoded,batchJson:result.batch===null?null:JSON.stringify(result.batch)});
}
for(const [path,text]of sources)check('unchanged:'+path,await Bun.file(path).text(),text);
const inputs={version:'umf.security.atomic-presence-handoff/0.1-candidate',sources:Object.fromEntries(sources),sourcePins:Object.fromEntries(Array.from(sources,([path,text])=>[path,sha(text)])),externalDependencyAssumptions:{bun:Bun.version,ajvVersion:JSON.parse(sources.get(relative(process.cwd(),Bun.resolveSync('ajv/package.json',process.cwd())))!).version,externalClosureHermetic:false},packets};
const bytes=JSON.stringify(inputs,null,2)+'\n';await Bun.write(output+'/inputs.json',bytes);
await Bun.write(output+'/receipt.json',JSON.stringify({status:'passed',producerProtocol:'umf.security.logical-disclosure-batch/0.1-candidate',producerApi:'evaluateCandidateCatalogReadDisclosureBatchWithinOperation',inputSnapshotSha256:sha(bytes),scenarios:packets.length,controls,scope:'Actual atomic policy fold, pure null-out recipe and public V2 inspector/codecs on an explicit optional Resource source and separately authored Token read policy. Stored original remains token-domain input, not prestorage clear or a vault operation. Complete supplied logical facts are not authenticated native/source/caller/current cut. No compiler/native execution, operator/release authority, backend acceptance or case promotion.'},null,2)+'\n');
console.log(JSON.stringify({status:'passed',scenarios:packets.length,controls:controls.length,selectedSources:sources.size}));
