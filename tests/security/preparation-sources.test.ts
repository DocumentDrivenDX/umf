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
// Native preparation is pinned to an external Truss0.8 profile. Original positive
// and correspondence controls are archived; they cannot qualify current core.
test('authored owner profile actually passes existing logical write consumer for original/proposed products',()=>{
 const p=preparationSourcesFixture(),policy=decode(p.policy),ontology=decode(p.ontology),closure=decode(p.coreClosure),owner=decode(p.owner),profile=decode(p.writeProfile),handle=compileCandidateCatalogProgram(policy,null,closure,ontology,[],createCandidateCoreExtensionClosure([{id:'umf.actions',version:'0.1.0'}]));
 const target=ontology.entities.find((e:any)=>e.type.elementId==='products'),subject=ontology.entities.find((e:any)=>e.type.elementId==='person');
 const cut=(name:string)=>({version:'umf.security.logical-facts/0.1',trusted:true,generation:'g1',expectedGeneration:'g1',policy:{id:policy.id,revision:policy.revision},ontology:policy.ontology,protection:null,domains:closure.pins,owner:{id:owner.id,revision:owner.revision},subject:{type:subject.type,key:[{string:'alice'}]},facts:[{type:subject.type,key:[{string:'alice'}],fields:[{field:subject.fields[0].ref,value:{string:'alice'}}],absent:[]},{type:target.type,key:[{string:'bar'}],fields:[{field:target.fields[0].ref,value:{string:'bar'}},{field:target.fields[1].ref,value:{string:name}}],absent:[]}],graphs:[],coverage:ontology.entities.map((e:any)=>({type:e.type,complete:true,fields:e.fields.map((f:any)=>f.ref)})),graphCoverage:[],context:[],valueProfiles:[],maxFacts:100,maxSteps:100000});
 const request={version:'umf.security.catalog-transaction/0.1',profile:{id:profile.id,revision:profile.revision},before:cut('old'),after:cut('Foo'),mutations:[{operation:'update',type:target.type,key:[{string:'bar'}]}],maxSteps:100000,maxFacts:100};
 expect(evaluateCandidateCatalogWrite(handle,owner,profile,request)).toEqual({decision:'permit',complete:false,authority:false});
});
test('native Subject carrier uses original String Key codec with exact Unicode and explicit refusal domains',()=>{
 const p=preparationSourcesFixture(),encode=(v:string)=>derivePreparationSubjectKey(p.subjectMapping,p.coreClosure,Buffer.from(JSON.stringify(v)).toString('hex'));
 expect(encode('alice').receipt.version).toBe('4.0.0');expect(encode('alice').receipt.profile).toBe('umf-key-tuple-v1');expect(encode('alice').receipt.bytesHex).toBe('554d464b31010405616c696365');expect(encode('é').receipt.bytesHex).toBe('554d464b31010402c3a9');expect(encode('😀').receipt.bytesHex).toBe('554d464b31010404f09f9880');expect(encode('e\u0301').receipt.bytesHex).not.toBe(encode('é').receipt.bytesHex);
 for(const v of ['\0','\ud800','\udfff'])expect(()=>encode(v)).toThrow();
 for(const raw of ['["alice"]','"\\u0061"','null'])expect(()=>derivePreparationSubjectKey(p.subjectMapping,p.coreClosure,Buffer.from(raw).toString('hex'))).toThrow();
 expect(()=>derivePreparationSubjectKey(p.subjectMapping,p.coreClosure,'c0af')).toThrow();
 expect(()=>derivePreparationSubjectKey(p.subjectMapping,p.coreClosure,'efbbbf'+Buffer.from('"alice"').toString('hex'))).toThrow();
});
test('historical native preparation cannot qualify the authored current logical declaration',()=>{
 const p=preparationSourcesFixture(),before=JSON.stringify(p);
 expect(()=>compilePreparationSourceObligations(p)).toThrow('selected current core/batch bound');
 expect(JSON.stringify(p)).toBe(before);
 const original=preparationSourcesFixture();change(original,'coreClosure',v=>{v.documents[0].document=decode(decode(original.request).model);v.documents[1].document.umf='0.8.0';});
 expect(()=>compilePreparationSourceObligations(original)).toThrow('SECURITY_CANDIDATE_CORE_SOURCE_UNRESOLVED');
});
test('current Subject codec retains accessor and refined-domain refusals without native authority',()=>{
 const p=preparationSourcesFixture();let calls=0;const hostile={...p.subjectMapping,get utf8(){calls++;return p.subjectMapping.utf8;}};
 expect(()=>derivePreparationSubjectKey(hostile,p.coreClosure,'22616c69636522')).toThrow();expect(calls).toBe(0);
 const refined=preparationSourcesFixture();change(refined,'coreClosure',v=>{v.documents[1].document.modules[0].elements[0].allowedValues=[{string:'alice'}];});
 expect(()=>derivePreparationSubjectKey(refined.subjectMapping,refined.coreClosure,'22616c69636522')).toThrow('native unrefined Subject String Key domain');
});
test('host CLI refuses unsupported native preparation and malformed UTF8 without issuing output',()=>{
 const dir=mkdtempSync(join(tmpdir(),'umf-preparation-sources-')),path=join(dir,'packet.json'),cli=new URL('../../tools/security/protection-preparation-sources.ts',import.meta.url).pathname;
 try{
  const p=preparationSourcesFixture();writeFileSync(path,JSON.stringify(p));const unsupported=Bun.spawnSync([process.execPath,cli,path]);expect(unsupported.exitCode).not.toBe(0);expect(unsupported.stdout.byteLength).toBe(0);
  change(p,'policy',v=>v.id='bulk-\ufffd-policy');const bytes=Buffer.from(JSON.stringify(p)),at=bytes.indexOf(Buffer.from('\ufffd'));expect(at).toBeGreaterThanOrEqual(0);
  writeFileSync(path,Buffer.concat([bytes.subarray(0,at),Buffer.from([255]),bytes.subarray(at+3)]));const bad=Bun.spawnSync([process.execPath,cli,path]);expect(bad.exitCode).not.toBe(0);expect(bad.stdout.byteLength).toBe(0);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
