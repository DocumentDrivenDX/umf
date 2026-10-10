import {createHash} from 'node:crypto';
import {lowerCandidateSecurityCondition,lowerCandidateSecurityRuleFold,lowerCandidateSecurityDisclosure,type CandidateConditionScan} from '/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-condition';
const module='/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-condition.ts',test='/Users/erik/Projects/truss/tests/security-candidate-condition.test.ts',proofPath='docs/helix/04-build/evidence/security/original-graph-ir-formal.json';
const proof=await Bun.file(proofPath).json(),digest=async(p:string)=>createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex');
for(const [p,h] of Object.entries(proof.sourceDigests))if(await digest(p)!==h)throw Error('Stale original compiler source');
const binary='/private/tmp/umf-security-weft-bridge-target/debug/examples/security_candidate_ir';if(await digest(binary)!==proof.binarySha256)throw Error('Original compiler binary differs');
const compositionOracle='/Users/erik/Projects/weft/crates/weft-core/tests/security-composition-oracle.json';
const paths=[compositionOracle,module,test,'/Users/erik/Projects/truss/packages/postgresql/src/security-graph-source.ts','/Users/erik/Projects/truss/packages/postgresql/src/security-candidate-endpoint.ts','tools/security/truss-candidate-condition-check.ts',proofPath,binary,...Object.keys(proof.sourceDigests)];
const before=Object.fromEntries(await Promise.all(paths.map(async p=>[p,await digest(p)])));
async function run(command:string[],input?:string){const p=Bun.spawn(command,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [exitCode,stdout,stderr]=await Promise.all([p.exited,new Response(p.stdout).text(),new Response(p.stderr).text()]);if(exitCode)throw Error(stderr);return {command,exitCode,stdout,stderr};}
const runs=[await run(['bun','test',test]),await run(['bun','node_modules/typescript/bin/tsc','--ignoreConfig','--noEmit','--strict','--resolveJsonModule','--target','ES2022','--module','ESNext','--moduleResolution','bundler','--types','bun','--skipLibCheck',module,test,'tools/security/truss-candidate-condition-check.ts'])];
const artifacts=[];
for(const id of ['mixed','mixed-negated']){
 const original=proof.artifacts.find((a:any)=>a.id===id);if(!original)throw Error('Missing actual source fixture');const replay=await run([binary],JSON.stringify(original.request));runs.push(replay);const rules=JSON.parse(replay.stdout);if(JSON.stringify(rules)!==JSON.stringify(original.rules))throw Error('Original IR differs');
 const doc=JSON.parse(original.request.modules[0].documentJson),scans:CandidateConditionScan[]=[];
 const reference=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
 const selectedFields=(owner:any,keyId:string)=>doc.modules.find((m:any)=>m.id===owner.moduleId).elements.find((e:any)=>e.id===owner.elementId).keys.find((k:any)=>k.id===keyId).fields.map((f:any)=>({documentId:owner.documentId,moduleId:f.module,elementId:f.element}));
 function walk(v:any){if(!v||typeof v!=='object')return;if(v.exists){const e=v.exists,record=e.witness.recordKey;scans.push({association:e.association,home:{schema:'candidate',table:'relationshipId' in e.association?'works_on':'ownership'},endpoints:[],...(record?{record:{owner:record.owner,keyId:record.keyId,keyFields:selectedFields(record.owner,record.keyId),columns:['own_id']}}:{})});walk(e.condition);}else if(v.endpoint){const e=v.endpoint,scan=scans.find(s=>JSON.stringify(s.association)===JSON.stringify(e.association))!;if(!scan.endpoints.some(m=>m.role===e.role))(scan.endpoints as any[]).push({association:e.association,role:e.role,target:e.target,keyId:e.keyId,targetKeyFields:selectedFields(e.target,e.keyId),carrier:e.carrier,columns:[e.role+'_key']});}else Object.values(v).forEach(walk);}
 walk(rules[0].condition);
 const input={condition:rules[0].condition,scans,subject:{target:reference('Staff'),keyId:'pk',keyFields:selectedFields(reference('Staff'),'pk'),parameters:[2]},resource:{target:reference('Resource'),keyId:'pk',keyFields:selectedFields(reference('Resource'),'pk'),parameters:[1]}};
 artifacts.push({id,request:original.request,rules,input,sql:lowerCandidateSecurityCondition(input)});
 const typedInput=structuredClone(input);for(const scan of typedInput.scans){if(!('table' in scan.home))throw Error('Expected raw compiler fixture');scan.home.table='facts';scan.discriminator={column:'type_id',carrier:'int4',value:'relationshipId' in scan.association?'11':'12'};}
 artifacts.push({id:id+'-typed',request:original.request,rules,input:typedInput,sql:lowerCandidateSecurityCondition(typedInput)});
}
const scalarArtifacts=[];
{
 const request=structuredClone(proof.artifacts.find((a:any)=>a.id==='mixed').request),policy=JSON.parse(request.policyJson),ontology=JSON.parse(request.ontologyJson);
 const field={documentId:'domain',moduleId:'m',elementId:'resourceId'};ontology.context=[field];
 const constant={kind:'constant',field,value:{string:'r1'}};policy.rules[0].condition={op:'and',args:[{op:'eq',left:{kind:'resource',field},right:constant},{op:'eq',left:{kind:'context',field},right:constant}]};
 request.policyJson=JSON.stringify(policy);request.ontologyJson=JSON.stringify(ontology);
 const execution=await run([binary],JSON.stringify(request));runs.push(execution);const rules=JSON.parse(execution.stdout),domain=rules[0].condition.and[0].equal[0].value.field.domain;
 const input={condition:rules[0].condition,scans:[],resource:{target:{documentId:'domain',moduleId:'m',elementId:'Resource'},keyId:'pk',keyFields:[field],parameters:[1]},values:[{binding:'resource' as const,owner:{documentId:'domain',moduleId:'m',elementId:'Resource'},field,domain,parameter:1},{binding:'context' as const,field,domain,parameter:4}]};
 scalarArtifacts.push({id:'original-resource-context-string',request,rules,input,sql:lowerCandidateSecurityCondition(input)});
}
{
 const request=structuredClone(proof.artifacts.find((a:any)=>a.id==='mixed').request),policy=JSON.parse(request.policyJson),ontology=JSON.parse(request.ontologyJson),field={documentId:'domain',moduleId:'m',elementId:'salary'};ontology.context=[field];
 const constant={kind:'constant',field,value:{integerToken:'9007199254740993'}};policy.rules[0].condition={op:'and',args:[{op:'eq',left:{kind:'resource',field},right:constant},{op:'eq',left:{kind:'context',field},right:constant}]};request.policyJson=JSON.stringify(policy);request.ontologyJson=JSON.stringify(ontology);
 const execution=await run([binary],JSON.stringify(request));runs.push(execution);const rules=JSON.parse(execution.stdout),domain=rules[0].condition.and[0].equal[0].value.field.domain,resource={documentId:'domain',moduleId:'m',elementId:'Resource'};
 const input={condition:rules[0].condition,scans:[],resource:{target:resource,keyId:'pk',keyFields:[{documentId:'domain',moduleId:'m',elementId:'resourceId'}],parameters:[1]},values:[{binding:'resource' as const,owner:resource,field,domain,parameter:3},{binding:'context' as const,field,domain,parameter:4}]};
 scalarArtifacts.push({id:'original-resource-context-integer',request,rules,input,sql:lowerCandidateSecurityCondition(input)});
}
for(const profile of [{kind:'decimal',facets:{precision:20,scale:3},literal:{decimalToken:'9007199254740993.125'}},{kind:'binary',facets:{},literal:{binaryHex:'00FF'}},{kind:'boolean',facets:{},literal:{boolean:true}}]){
 const request=structuredClone(proof.artifacts.find((a:any)=>a.id==='mixed').request),policy=JSON.parse(request.policyJson),ontology=JSON.parse(request.ontologyJson),doc=JSON.parse(request.modules[0].documentJson),field={documentId:'domain',moduleId:'m',elementId:'salary'};
 const declaration=doc.modules[0].elements.find((e:any)=>e.id==='salary');declaration.scalarType=profile.kind;declaration.facets=profile.facets;request.modules[0].documentJson=JSON.stringify(doc);request.modules[0].pin.sha256=createHash('sha256').update(request.modules[0].documentJson).digest('hex');ontology.context=[field];
 const constant={kind:'constant',field,value:profile.literal};policy.rules[0].condition={op:'and',args:[{op:'eq',left:{kind:'resource',field},right:constant},{op:'eq',left:{kind:'context',field},right:constant}]};request.policyJson=JSON.stringify(policy);request.ontologyJson=JSON.stringify(ontology);
 const execution=await run([binary],JSON.stringify(request));runs.push(execution);const rules=JSON.parse(execution.stdout),domain=rules[0].condition.and[0].equal[0].value.field.domain,resource={documentId:'domain',moduleId:'m',elementId:'Resource'};
 const input={condition:rules[0].condition,scans:[],resource:{target:resource,keyId:'pk',keyFields:[{documentId:'domain',moduleId:'m',elementId:'resourceId'}],parameters:[1]},values:[{binding:'resource' as const,owner:resource,field,domain,parameter:3},{binding:'context' as const,field,domain,parameter:4}]};
 scalarArtifacts.push({id:'original-resource-context-'+profile.kind,request,rules,input,sql:lowerCandidateSecurityCondition(input)});
}
const guardArtifacts=[];
for(const kind of ['integer','decimal','integer-width']){
 const seed=scalarArtifacts.find(a=>a.id==='original-resource-context-'+(kind==='integer-width'?'integer':kind))!,request=structuredClone(seed.request),policy=JSON.parse(request.policyJson);
 if(kind==='integer-width'){const doc=JSON.parse(request.modules[0].documentJson);doc.modules[0].elements.find((e:any)=>e.id==='salary').facets={integerWidth:{bits:64,signed:true}};request.modules[0].documentJson=JSON.stringify(doc);request.modules[0].pin.sha256=createHash('sha256').update(request.modules[0].documentJson).digest('hex');}
 policy.rules[0].condition={op:'not',arg:policy.rules[0].condition};request.policyJson=JSON.stringify(policy);
 const execution=await run([binary],JSON.stringify(request));runs.push(execution);const rules=JSON.parse(execution.stdout),domain=rules[0].condition.not.and[0].equal[0].value.field.domain,input=structuredClone(seed.input);input.condition=rules[0].condition;for(const value of input.values)value.domain=domain;
 guardArtifacts.push({id:'negated-'+kind,request,rules,input,sql:lowerCandidateSecurityCondition(input)});
}
{
 const seed=artifacts.find(a=>a.id==='mixed-typed')!,request=structuredClone(seed.request),policy=JSON.parse(request.policyJson),field={documentId:'domain',moduleId:'m',elementId:'ownerResource'},association={documentId:'domain',moduleId:'m',elementId:'Ownership'};
 policy.rules[0].condition={op:'or',args:[{op:'literal',value:true},{op:'exists',association,as:'owner',where:{op:'eq',left:{kind:'variable',name:'owner',field},right:{kind:'constant',field,value:{string:'r1'}}}}]};request.policyJson=JSON.stringify(policy);
 const execution=await run([binary],JSON.stringify(request));runs.push(execution);const rules=JSON.parse(execution.stdout),domain=rules[0].condition.or[1].exists.condition.equal[0].value.field.domain,input=structuredClone(seed.input);input.condition=rules[0].condition;input.scans=input.scans.filter(s=>'elementId' in s.association);input.scans[0]!.fields=[{owner:association,field,domain,column:'resource_key'}];
 guardArtifacts.push({id:'record-string-or-true',request,rules,input,sql:lowerCandidateSecurityCondition(input)});
}
const foldArtifacts=[];
for(const reverse of [false,true]){
 const request=structuredClone(proof.artifacts.find((a:any)=>a.id==='mixed').request),policy=JSON.parse(request.policyJson),ontology=JSON.parse(request.ontologyJson),doc=JSON.parse(request.modules[0].documentJson),target={documentId:'domain',moduleId:'m',elementId:'Resource'};
 const refs=['permitTruth','requireTruth','forbidTruth'].map(elementId=>({documentId:'domain',moduleId:'m',elementId}));
 for(const field of refs){doc.modules[0].elements.push({id:field.elementId,kind:'field',scalarType:'boolean',nullability:'required',cardinality:'one',extensions:{}});doc.modules[0].elements.find((e:any)=>e.id==='Resource').members.push({module:'m',element:field.elementId});ontology.entities.find((e:any)=>e.type.elementId==='Resource').fields.push({ref:field,protection:'unprotected'});}
 request.modules[0].documentJson=JSON.stringify(doc);request.modules[0].pin.sha256=createHash('sha256').update(request.modules[0].documentJson).digest('hex');ontology.context=refs;
 policy.rules=['permit','require','forbid'].map((effect,i)=>({...structuredClone(policy.rules[0]),id:effect,effect,disclosure:[],condition:{op:'eq',left:{kind:'context',field:refs[i]},right:{kind:'constant',field:refs[i],value:{boolean:true}}}}));for(const rule of policy.rules)if(rule.effect!=='permit')delete rule.disclosure;if(reverse)policy.rules.reverse();request.policyJson=JSON.stringify(policy);request.ontologyJson=JSON.stringify(ontology);
 const execution=await run([binary],JSON.stringify(request));runs.push(execution);const rules=JSON.parse(execution.stdout),values=refs.map((field,i)=>({binding:'context' as const,field,domain:rules.find((r:any)=>r.id===['permit','require','forbid'][i]).condition.equal[0].value.context.domain,parameter:i+1})),input={rules,target,action:'read',scans:[],values};
 const compiled=lowerCandidateSecurityRuleFold(input);foldArtifacts.push({id:reverse?'rule-fold-reversed':'rule-fold',request,rules,input,...compiled,ruleTruthSqls:rules.map((r:any)=>({id:r.id,sql:lowerCandidateSecurityCondition({scans:[],values,condition:r.condition})}))});
}
for(const mode of ['correlated-fold','correlated-fold-reversed','unscoped-action-fold','unscoped-target-fold']){
 const seed=artifacts.find(a=>a.id==='mixed')!,request=structuredClone(seed.request),policy=JSON.parse(request.policyJson),original=structuredClone(policy.rules[0]),association={documentId:'domain',moduleId:'m',relationshipId:'WorksOn'};
 policy.rules=['permit','require','forbid'].map(effect=>({...structuredClone(original),id:effect,effect,disclosure:[],condition:effect==='forbid'?original.condition:{op:'literal',value:true}}));
 if(mode==='unscoped-action-fold')policy.rules[2].actions=['update'];
 if(mode==='unscoped-target-fold'){policy.rules[2].target=[{documentId:'domain',moduleId:'m',elementId:'Project'}];policy.rules[2].condition={op:'exists',association,as:'edge',where:{op:'and',args:[{op:'eq',left:{kind:'variable',name:'edge',endpoint:'staff'},right:{kind:'subject',identity:true}},{op:'eq',left:{kind:'variable',name:'edge',endpoint:'project'},right:{kind:'resource',identity:true}}]}};}
 for(const rule of policy.rules)if(rule.effect!=='permit')delete rule.disclosure;if(mode==='correlated-fold-reversed')policy.rules.reverse();request.policyJson=JSON.stringify(policy);
 const execution=await run([binary],JSON.stringify(request));runs.push(execution);const rules=JSON.parse(execution.stdout),input={rules,target:{documentId:'domain',moduleId:'m',elementId:'Resource'},action:'read',scans:seed.input.scans,subject:seed.input.subject,resource:seed.input.resource},compiled=lowerCandidateSecurityRuleFold(input);
 const ruleTruthSqls=rules.filter((r:any)=>compiled.ruleIds.includes(r.id)).map((r:any)=>({id:r.id,sql:lowerCandidateSecurityCondition({...seed.input,condition:r.condition})}));
 foldArtifacts.push({id:mode,request,rules,input,...compiled,ruleTruthSqls});
}
const expectedDecisions=(await Bun.file(compositionOracle).json()).decisions;
const disclosureArtifacts=[];
for(const id of ['protected-default','unprotected-default','original','withheld','mask','equivalent-masks','conflicting-masks','withheld-over-conflict','inactive-mask','action-excluded-mask','denied-disclosure','unknown-disclosure','missing-before-conflict','conflict-before-missing','inactive-withhold']){
 const seed=artifacts.find(a=>a.id==='mixed')!,request=structuredClone(seed.request),policy=JSON.parse(request.policyJson),ontology=JSON.parse(request.ontologyJson),doc=JSON.parse(request.modules[0].documentJson),salary={documentId:'domain',moduleId:'m',elementId:'salary'},resourceId={documentId:'domain',moduleId:'m',elementId:'resourceId'},original=structuredClone(policy.rules[0]);
 const disclosure=(field:any,kind:string,value?:any)=>({field,disposition:kind==='transformed'?{kind,transform:'constant',version:'0.1.0',field,value}:{kind}});
 const rule=(name:string,entries:any[],condition:any={op:'literal',value:true},actions=['read'])=>({...structuredClone(original),id:name,condition,actions,disclosure:entries});
 const mask=(token:string)=>disclosure(salary,'transformed',{integerToken:token});let outputs=[salary],decision='permit',chosen:any='original';
 if(id==='protected-default')policy.rules=[rule('p',[])],decision='indeterminate';
 else if(id==='unprotected-default')policy.rules=[rule('p',[])],outputs=[resourceId];
 else if(id==='original')policy.rules=[rule('p',[disclosure(salary,'original')])];
 else if(id==='withheld')policy.rules=[rule('p',[disclosure(salary,'withheld')])],chosen='withheld';
 else if(id==='mask')policy.rules=[rule('p',[mask('1000')])],chosen='mask';
 else if(id==='equivalent-masks')policy.rules=[rule('a',[mask('1000')]),rule('b',[mask('1e3')])],chosen='mask';
 else if(id==='conflicting-masks'||id==='withheld-over-conflict'||id==='inactive-withhold'){policy.rules=[rule('a',[mask('1000')]),rule('b',[mask('2000')])];decision='conflict';if(id!=='conflicting-masks'){policy.rules.push(rule('w',[disclosure(salary,'withheld')],{op:'literal',value:id==='withheld-over-conflict'}));if(id==='withheld-over-conflict')decision='permit',chosen='withheld';}}
 else if(id==='inactive-mask')policy.rules=[rule('p',[]),rule('m',[mask('1000')],{op:'literal',value:false})],decision='indeterminate';
 else if(id==='action-excluded-mask')policy.rules=[rule('p',[]),rule('m',[mask('1000')],{op:'literal',value:true},['update'])],decision='indeterminate';
 else if(id==='denied-disclosure')policy.rules=[rule('p',[disclosure(salary,'original')],{op:'literal',value:false})],decision='deny';
 else if(id==='unknown-disclosure')policy.rules=[rule('p',[disclosure(salary,'withheld')],original.condition)],decision='indeterminate';
 else{policy.rules=[rule('a',[disclosure(resourceId,'transformed',{string:'x'})]),rule('b',[disclosure(resourceId,'transformed',{string:'y'})])];outputs=id==='missing-before-conflict'?[salary,resourceId]:[resourceId,salary];decision=id==='missing-before-conflict'?'indeterminate':'conflict';}
 request.policyJson=JSON.stringify(policy);const execution=await run([binary],JSON.stringify(request));runs.push(execution);const rules=JSON.parse(execution.stdout);
 const fields=ontology.entities.flatMap((entity:any)=>entity.fields.map((f:any)=>{const source=doc.modules.find((m:any)=>m.id===f.ref.moduleId).elements.find((e:any)=>e.id===f.ref.elementId);return {owner:entity.type,field:f.ref,protection:f.protection,domain:{scalarType:source.scalarType,nullability:source.nullability,cardinality:source.cardinality,facets:source.facets??{},allowedValues:source.allowedValues??null}};}));
 const input={rules,target:{documentId:'domain',moduleId:'m',elementId:'Resource'},action:'read',scans:seed.input.scans,subject:seed.input.subject,resource:seed.input.resource,fields,outputFields:outputs},compiled=lowerCandidateSecurityDisclosure(input);
 const disposition=chosen==='mask'?rules[0].disclosure[0][1]:chosen;const expected={decision,disclosure:decision==='permit'?[{field:outputs[0],disposition}]:[]};
 disclosureArtifacts.push({id:'disclosure-'+id,request,rules,input,...compiled,expected});
}
for(const count of [100,101]){
 const seed=artifacts.find(a=>a.id==='mixed')!,request=structuredClone(seed.request),policy=JSON.parse(request.policyJson),ontology=JSON.parse(request.ontologyJson),doc=JSON.parse(request.modules[0].documentJson),target={documentId:'domain',moduleId:'m',elementId:'Resource'};
 const record=doc.modules[0].elements.find((e:any)=>e.id==='Resource'),entity=ontology.entities.find((e:any)=>e.type.elementId==='Resource'),outputs=[];
 for(let i=0;i<count;i++){
  const id='boundary'+i,field={documentId:'domain',moduleId:'m',elementId:id};outputs.push(field);
  doc.modules[0].elements.push({id,kind:'field',scalarType:'integer',nullability:'required',cardinality:'one',extensions:{}});
  record.members.push({module:'m',element:id});entity.fields.push({ref:field,protection:'unprotected'});
 }
 policy.rules=[{...policy.rules[0],id:'boundary',condition:{op:'literal',value:true},disclosure:[]}];
 request.modules[0].documentJson=JSON.stringify(doc);request.modules[0].pin.sha256=createHash('sha256').update(request.modules[0].documentJson).digest('hex');request.ontologyJson=JSON.stringify(ontology);request.policyJson=JSON.stringify(policy);
 const execution=await run([binary],JSON.stringify(request));runs.push(execution);const rules=JSON.parse(execution.stdout);
 const fields=outputs.map(field=>({owner:target,field,protection:'unprotected' as const,domain:{scalarType:'integer',nullability:'required',cardinality:'one',facets:{},allowedValues:null}}));
 const input={rules,target,action:'read',scans:[],fields,outputFields:outputs},compiled=lowerCandidateSecurityDisclosure(input),expected={decision:'permit',disclosure:outputs.map(field=>({field,disposition:'original'}))};
 disclosureArtifacts.push({id:'disclosure-boundary-'+count,request,rules,input,...compiled,expected});
}
for(const [p,h] of Object.entries(before))if(await digest(p)!==h)throw Error('Captured source changed');
await Bun.write('docs/helix/04-build/evidence/security/truss-candidate-condition.json',JSON.stringify({status:'passed',sourceDigests:before,runs,artifacts,scalarArtifacts,guardArtifacts,foldArtifacts,disclosureArtifacts,expectedDecisions,covers:['US-056-AC2'],nativeImplementationQualified:false,scope:'Includes seventeen original-compiler disclosure-metadata profiles: protected defaults, original/withheld/constant masks, equivalent/conflicting masks, active-rule filtering, requested-field error order and ordered 100/101-field arrays. Boundary profiles supply the requested field inventory only and have literal conditions without scans. Includes original compiler whole-condition guard artifacts and six target/action-scoped empty-disclosure rule-truth folds; shared missing scalar carriers poison all mapped rule truths, while correlated endpoint diagnostics isolate a single Unknown forbid alongside True permit/require. This does not authorize output fields. Two actual original Rust mixed source/IR fixtures, each with separate and shared typed homes, plus original resource/context string, integer, decimal, binary and Boolean fixtures (the latter three pin deliberately edited source domains), lowered to draft SQL conditions with strict data snapshotting and coherent ordered Key descriptors. Unit refusal controls include method/getter substitution, reversed same-typed components and malformed/substituted original Key metadata. Native SQL execution, complete facts, broader constrained domains/native scalar admission, released field values, broader disclosure transforms, source authentication and backend acceptance remain open.'},null,2)+'\n');
console.log(JSON.stringify({status:'passed',artifacts:artifacts.length,runs:runs.length}));
