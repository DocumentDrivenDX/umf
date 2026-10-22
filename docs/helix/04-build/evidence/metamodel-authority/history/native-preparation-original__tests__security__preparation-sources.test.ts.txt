import {test,expect} from 'bun:test';
import {compilePreparationSourceObligations,derivePreparationSubjectKey,preparationSourceArtifact as artifact} from '../../tools/security/protection-preparation-sources';
import {preparationSourcesFixture} from './preparation-sources-fixture';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {createCandidateCoreExtensionClosure} from '../../src/extensions/security/core-extension-closure-candidate';
import {evaluateCandidateCatalogWrite} from '../../src/extensions/security/catalog-write-candidate';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const decode=(a:any)=>JSON.parse(a.utf8),change=(p:any,k:string,fn:(v:any)=>void)=>{const v=decode(p[k]);fn(v);p[k]=artifact(v);};
test('original enrolled products packet derives separate read/update/Field requirements from explicit owner designations',()=>{
 const p=preparationSourcesFixture(),r=compilePreparationSourceObligations(p);expect(r.readRequirements.map((x:any)=>[x.field.elementId,x.action])).toEqual([['product-id','bulk-prepare-read'],['product-name','bulk-prepare-read']]);
 expect(r.writeRequirements).toEqual([{field:{documentId:'product-action-demo',moduleId:'sales',elementId:'product-name'},objectAction:'products-update',fieldAction:'product-name-write',originalReadAction:'bulk-prepare-read',states:['before','after']}]);
 expect(r.actionRoles.roles).toEqual(['bulk-editor']);expect(r.actionRoles.personRequired).toBe(true);expect(r.authority).toBe(false);expect(r.complete).toBe(false);expect(r.original.compileResponse).toEqual(p.compileResponse);expect(r.nativeObligations[1].status).toBe('required');
 expect(r.nativeFields.map((f:any)=>[f.field.elementId,f.typeId,f.propertyId])).toEqual([['product-id','1','1'],['product-name','1','2']]);
 expect(r.original.bindingEnvelope).toEqual(p.bindingEnvelope);
 const mismatched=preparationSourcesFixture();change(mismatched,'bindingEnvelope',v=>{v.sha256='0'.repeat(64);});expect(()=>compilePreparationSourceObligations(mismatched)).toThrow();
});
test('authored owner profile actually passes existing logical write consumer for original/proposed products',()=>{
 const p=preparationSourcesFixture(),policy=decode(p.policy),ontology=decode(p.ontology),closure=decode(p.coreClosure),owner=decode(p.owner),profile=decode(p.writeProfile),handle=compileCandidateCatalogProgram(policy,null,closure,ontology,[],createCandidateCoreExtensionClosure([{id:'umf.actions',version:'0.1.0'}]));
 const target=ontology.entities.find((e:any)=>e.type.elementId==='products'),subject=ontology.entities.find((e:any)=>e.type.elementId==='person');
 const cut=(name:string)=>({version:'umf.security.logical-facts/0.1',trusted:true,generation:'g1',expectedGeneration:'g1',policy:{id:policy.id,revision:policy.revision},ontology:policy.ontology,protection:null,domains:closure.pins,owner:{id:owner.id,revision:owner.revision},subject:{type:subject.type,key:[{string:'alice'}]},facts:[{type:subject.type,key:[{string:'alice'}],fields:[{field:subject.fields[0].ref,value:{string:'alice'}}],absent:[]},{type:target.type,key:[{string:'bar'}],fields:[{field:target.fields[0].ref,value:{string:'bar'}},{field:target.fields[1].ref,value:{string:name}}],absent:[]}],graphs:[],coverage:ontology.entities.map((e:any)=>({type:e.type,complete:true,fields:e.fields.map((f:any)=>f.ref)})),graphCoverage:[],context:[],valueProfiles:[],maxFacts:100,maxSteps:100000});
 const request={version:'umf.security.catalog-transaction/0.1',profile:{id:profile.id,revision:profile.revision},before:cut('old'),after:cut('Foo'),mutations:[{operation:'update',type:target.type,key:[{string:'bar'}]}],maxSteps:100000,maxFacts:100};
 expect(evaluateCandidateCatalogWrite(handle,owner,profile,request)).toEqual({decision:'permit',complete:false,authority:false});
});
test('native Subject carrier uses original String Key codec with exact Unicode and explicit refusal domains',()=>{
 const p=preparationSourcesFixture(),encode=(v:string)=>derivePreparationSubjectKey(p.subjectMapping,p.coreClosure,Buffer.from(JSON.stringify(v)).toString('hex'));
 expect(encode('alice').receipt.bytesHex).toBe('554d464b31010405616c696365');expect(encode('é').receipt.bytesHex).toBe('554d464b31010402c3a9');expect(encode('😀').receipt.bytesHex).toBe('554d464b31010404f09f9880');expect(encode('e\u0301').receipt.bytesHex).not.toBe(encode('é').receipt.bytesHex);
 for(const v of ['\0','\ud800','\udfff'])expect(()=>encode(v)).toThrow();
 for(const raw of ['["alice"]','"\\u0061"','null'])expect(()=>derivePreparationSubjectKey(p.subjectMapping,p.coreClosure,Buffer.from(raw).toString('hex'))).toThrow();
 expect(()=>derivePreparationSubjectKey(p.subjectMapping,p.coreClosure,'c0af')).toThrow();
 expect(()=>derivePreparationSubjectKey(p.subjectMapping,p.coreClosure,'efbbbf'+Buffer.from('"alice"').toString('hex'))).toThrow();
});
test('review controls refuse getter execution, profile drift, unknown selection meaning and refined Subject domains',()=>{
 const p=preparationSourcesFixture();let calls=0;const hostile={...p.subjectMapping,get utf8(){calls++;return p.subjectMapping.utf8;}};expect(()=>derivePreparationSubjectKey(hostile,p.coreClosure,'22616c69636522')).toThrow();expect(calls).toBe(0);
 const mutations=[(p:any)=>change(p,'writeProfile',v=>v.future={mandatory:true}),(p:any)=>change(p,'writeProfile',v=>v.id={x:1}),(p:any)=>change(p,'writeProfile',v=>v.revision=null),(p:any)=>change(p,'owner',v=>v.id=[]),(p:any)=>change(p,'writeProfile',v=>v.associations={length:0}),(p:any)=>change(p,'writeProfile',v=>v.types[0].policyFields={length:0}),(p:any)=>change(p,'writeProfile',v=>v.types[0].ownershipFields={length:0}),(p:any)=>change(p,'writeProfile',v=>v.types[0].readProtection.blindWriteActions={length:0}),(p:any)=>change(p,'coreClosure',v=>v.documents[1].document.modules[0].elements[0].allowedValues=[{string:'alice'}]),(p:any)=>{const response=decode(p.compileResponse),plan=decode(response.plan),selection=decode(plan.selection.artifact);selection.future={mandatory:true};plan.selection.artifact=artifact(selection);response.plan=artifact(plan);p.compileResponse=artifact(response);change(p,'loweringInvocation',v=>{const lower=JSON.parse(v.loweringRequest);lower.selection=plan.selection.artifact;v.loweringRequest=JSON.stringify(lower);});}];
 for(const mutate of mutations){const q=preparationSourcesFixture();mutate(q);expect(()=>compilePreparationSourceObligations(q)).toThrow();}
 const malformed=preparationSourcesFixture(),raw=malformed.policy.utf8.replace('bulk-products-policy','bulk-\ud800-policy');malformed.policy={...malformed.policy,utf8:raw,sha256:createHash('sha256').update(raw).digest('hex')};expect(()=>compilePreparationSourceObligations(malformed)).toThrow('unpaired surrogate');
});
test('exact selected interface, provenance, batch bounds and Subject Key are independently checked',()=>{
 for(const mutate of [(p:any)=>change(p,'request',v=>v.selectionProfile={id:'other',version:'9'}),(p:any)=>change(p,'request',v=>v.interfaceVersion='other/9'),(p:any)=>change(p,'compileResponse',v=>v.interfaceVersion='other/9'),(p:any)=>change(p,'compileResponse',v=>v.provenance.sourceSha256='0'.repeat(64)),(p:any)=>change(p,'request',v=>v.batchSize=101)]){const p=preparationSourcesFixture();mutate(p);expect(()=>compilePreparationSourceObligations(p)).toThrow();}
 const p=preparationSourcesFixture(),type=decode(p.subjectMapping).type,field={...type,elementId:'alternate-id'};
 change(p,'coreClosure',v=>{const es=v.documents[1].document.modules[0].elements;es.push({id:'alternate-id',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});es[1].members.push({module:'identity',element:'alternate-id'});es[1].keys.push({id:'alternate',name:'alternate',fields:[{module:'identity',element:'alternate-id'}]});});
 change(p,'ontology',v=>v.entities[0].fields.push({ref:field,protection:'unprotected'}));change(p,'owner',v=>v.storage.push({type,field,storageEffect:'canonical'}));change(p,'subjectMapping',v=>{v.keyId='alternate';v.field=field;});expect(()=>compilePreparationSourceObligations(p)).toThrow('Subject Key designation');
});
test('selected predicate restrictions and unknown lowering obligations are never dropped',()=>{
 for(const predicate of ['prohibited','original-authorized']){const p=preparationSourcesFixture();change(p,'ontology',v=>v.entities[1].fields[0].queryUse={predicate});expect(()=>compilePreparationSourceObligations(p)).toThrow('selected predicate mode');}
 const p=preparationSourcesFixture();change(p,'ontology',v=>v.entities[1].fields[0].queryUse={predicate:'disclosed'});expect(compilePreparationSourceObligations(p).authority).toBe(false);
 change(p,'loweringInvocation',v=>{const lower=JSON.parse(v.response);lower.obligations.push('future mandatory condition');v.response=JSON.stringify(lower);});expect(()=>compilePreparationSourceObligations(p)).toThrow('unknown original native lowering obligation');
});
test('actual host CLI emits the typed packet and refuses replacement-decoded transport bytes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'umf-preparation-sources-')),path=join(dir,'packet.json'),cli=new URL('../../tools/security/protection-preparation-sources.ts',import.meta.url).pathname;
 try{
  const p=preparationSourcesFixture();writeFileSync(path,JSON.stringify(p));const good=Bun.spawnSync([process.execPath,cli,path]);expect(good.exitCode).toBe(0);const output=JSON.parse(good.stdout.toString());expect(output.authority).toBe(false);expect(output.original.compileResponse).toEqual(p.compileResponse);
  change(p,'policy',v=>v.id='bulk-\ufffd-policy');const bytes=Buffer.from(JSON.stringify(p)),at=bytes.indexOf(Buffer.from('\ufffd'));expect(at).toBeGreaterThanOrEqual(0);writeFileSync(path,Buffer.concat([bytes.subarray(0,at),Buffer.from([255]),bytes.subarray(at+3)]));
  const bad=Bun.spawnSync([process.execPath,cli,path]);expect(bad.exitCode).not.toBe(0);expect(bad.stdout.byteLength).toBe(0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('missing owner actions and unsupported obligations refuse before any native installation',()=>{
 const mutations=[(p:any)=>change(p,'policy',v=>v.rules[1].actions=['product-name-write']),(p:any)=>change(p,'policy',v=>v.rules[1].actions=['products-update']),(p:any)=>change(p,'policy',v=>v.rules.shift()),(p:any)=>change(p,'writeProfile',v=>v.types[0].fieldActions.pop()),(p:any)=>change(p,'writeProfile',v=>v.types[0].readProtection.blindWriteActions=[{field:v.types[0].fieldActions[1].field,action:'blind'}]),(p:any)=>change(p,'policy',v=>v.rules[0].condition.value=false),(p:any)=>change(p,'ontology',v=>v.entities[1].fields[1].protection='protected'),(p:any)=>change(p,'subjectMapping',v=>v.carrier='Staff'),(p:any)=>change(p,'subjectMapping',v=>v.subjectKind='service'),(p:any)=>{p.catalog=artifact({});},(p:any)=>change(p,'request',v=>v.sql='UPDATE products SET name=\'Different\' WHERE id=\'bar\''),(p:any)=>change(p,'loweringInvocation',v=>{const r=JSON.parse(v.loweringRequest);r.maxItems=1;v.loweringRequest=JSON.stringify(r);}),(p:any)=>{p.binding.sha256='0'.repeat(64);}];
 for(const mutate of mutations){const p=preparationSourcesFixture();mutate(p);expect(()=>compilePreparationSourceObligations(p)).toThrow();}
});
