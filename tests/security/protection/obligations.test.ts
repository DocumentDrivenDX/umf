// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-079-AC15
// @covers US-079-AC3
// @covers US-079-AC10
import {test,expect} from 'bun:test';
import {inspectProtectionObligations} from '../../../src/extensions/security/protection/obligations';
import {inspectSecurityDisclosureV2} from '../../../src/extensions/security/protection/disclosure';
import {migrateCandidateSecurityOntology} from '../../../src/extensions/security/ontology-migration-candidate';
import {securityFixture,ref} from '../fixture';
function fixture(){
 const f=securityFixture(),ontology:any=structuredClone(migrateCandidateSecurityOntology(f.resolution.ontology,'ontology-purposes').target);
 const roles:any={'read':'read','update':'field','reverse':'reverse','vault-write':'vault-write','query-original':'original-authorized','field-access':'field','custom':'other'};
 ontology.actions=Object.keys(roles);ontology.actionPurposes=ontology.actions.map((action:string)=>({action,purposes:[roles[action]]}));
 const policy:any=structuredClone(f.policy);policy.version='0.2.0';policy.ontology.revision=ontology.revision;policy.protection={id:'c',revision:'c1'};
 policy.rules[0].disclosure[0].disposition={kind:'transformed',vocabulary:'umf.security.protection',transform:'token',version:'1',field:ref('resourceId')};
 policy.rules.push({id:'reverse-grant',effect:'permit',actions:['reverse'],target:[ref('Resource')],condition:{op:'literal',value:true}});
 const catalog:any={vocabulary:'umf.security.protection',version:'0.1.0',id:'c',revision:'c1',transforms:[{id:'token',version:'1',kind:'tokenize',inputDomain:ref('salary'),outputDomain:ref('resourceId'),determinism:'deterministic',reversibility:'vault',disclosureProfile:[],queryUse:{},parameters:[],reverseAction:'reverse',custody:{owner:'declared-owner',vaultRef:'opaque',formatPreserving:false,storageEffect:'stored-transformed',propagation:{history:'declared-history',snapshots:'declared-snapshots',exports:'declared-exports',feeds:'declared-feeds',caches:'declared-caches'},vaultWriteAction:'vault-write'}}],native:{opaque:'no execution'}};
 return {policy,catalog,ontology,closure:{pins:structuredClone(ontology.documents),documents:f.resolution.documents}};
}
const run=(f:ReturnType<typeof fixture>)=>inspectProtectionObligations(f.policy,f.catalog,f.closure,f.ontology);
const refuse=(f:ReturnType<typeof fixture>)=>{const r=run(f);expect(r.status).toBe('refused');expect(r.obligations).toEqual([]);expect(r.catalog).toEqual(f.catalog);expect(r.ontology).toEqual(f.ontology);return r;};
test('stored declarations retain every unverified custody, propagation and separate action obligation',()=>{
 const f=fixture(),r=run(f);expect(r.status).toBe('declared-obligations');expect([r.complete,r.authority]).toEqual([false,false]);expect(r.obligations.map(o=>o.kind)).toEqual(['stored-custody','propagation','propagation','propagation','propagation','propagation','vault-write-action','reverse-action']);expect(r.obligations.every(o=>o.status==='unverified')).toBe(true);expect(Object.isFrozen(r.obligations[0]?.declaration)).toBe(true);
 f.catalog.transforms[0].custody.owner='changed';expect((r.obligations[0]?.declaration as any).owner).toBe('declared-owner');
});
test('unsalted hashes require effective equality and report dictionary warning without executing an algorithm',()=>{
 const f=fixture(),t=f.catalog.transforms[0];t.kind='hash';t.algorithm='SHA-256';t.saltCustody={kind:'none'};t.reversibility='none';delete t.custody;delete t.reverseAction;
 const r=run(f);expect(r.status).toBe('declared-obligations');expect(r.obligations.map(o=>o.kind)).toEqual(['hash-algorithm','salt-custody','dictionary-attack-warning']);expect((r.obligations[2]?.declaration as any).code).toBe('UNSALTED_HASH_DICTIONARY_ATTACK');
 t.determinism='random';refuse(f);t.disclosureProfile=['equality'];expect(run(f).status).toBe('declared-obligations');
 t.saltCustody={kind:'keyed',owner:'opaque-owner',keyRef:'opaque-key'};t.disclosureProfile=[];expect(run(f).obligations.map(o=>o.kind)).toEqual(['hash-algorithm','salt-custody']);delete t.algorithm;refuse(f);
});
test('exact source purpose separation refuses ordinary aliases without banning explicit reverse grants',()=>{
 const f=fixture();expect(run(f).status).toBe('declared-obligations');
 for(const action of ['read','update','field-access','query-original','vault-write','custom','missing']){const x=fixture();x.catalog.transforms[0].reverseAction=action;refuse(x);}
 for(const action of ['read','reverse','query-original','custom','missing']){const x=fixture();x.catalog.transforms[0].custody.vaultWriteAction=action;refuse(x);}
 const x=fixture();x.catalog.transforms[0].reversibility='none';refuse(x);delete x.catalog.transforms[0].reverseAction;expect(run(x).status).toBe('declared-obligations');
});
test('source pins, complete declarations and selected domains refuse atomically, including unused transforms',()=>{
 for(const mutate of [
  (f:any)=>f.policy.ontology.revision='stale',(f:any)=>f.policy.ontology.documentId='other',(f:any)=>f.policy.rules[0].actions=['unclassified'],
  (f:any)=>delete f.ontology.actionPurposes,(f:any)=>f.ontology.actionPurposes.pop(),
  (f:any)=>f.policy.rules[0].disclosure[0].field=ref('projectId'),(f:any)=>f.policy.rules[0].disclosure[0].disposition.field=ref('projectId'),
  (f:any)=>{const t=structuredClone(f.catalog.transforms[0]);t.id='unused';t.reverseAction='read';f.catalog.transforms.push(t);},
  (f:any)=>f.catalog.transforms[0].custody.future=true,(f:any)=>f.catalog.transforms[0].custody.propagation.future='unknown',
 ]){const f=fixture();mutate(f);refuse(f);}
 for(const channel of ['history','snapshots','exports','feeds','caches'])for(const op of ['missing','empty','unknown-type']){const f=fixture(),p=f.catalog.transforms[0].custody.propagation;if(op==='missing')delete p[channel];else p[channel]=op==='empty'?'':{program:'opaque'};refuse(f);}
});
test('ordinary original transport carries the stored canonical token and never reverses it',()=>{
 const f=fixture();const batch={version:'umf.security.disclosure/0.2.0',policy:{id:f.policy.id,revision:f.policy.revision},protection:{id:'c',revision:'c1'},domains:f.closure.pins,columns:[{field:ref('resourceId'),storageEffect:'stored-transformed',storageTransform:{id:'token',version:'1'}}],rows:[[{disposition:'original',value:{string:'opaque-token'}}]]};
 expect(run(f).status).toBe('declared-obligations');const r=inspectSecurityDisclosureV2(batch,f.policy,f.catalog,f.closure);expect(r.status).toBe('validated-disclosure');expect(r.batch?.rows[0]?.[0]).toEqual({disposition:'original',value:{string:'opaque-token'}});expect(r.authority).toBe(false);
});
