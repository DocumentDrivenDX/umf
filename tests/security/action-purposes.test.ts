// @covers US-079-AC3
// @covers US-079-AC10
// @covers US-079-AC15
import {test,expect} from 'bun:test';
import {inspectSecurityActionPurposes} from '../../src/extensions/security/action-purposes';
import {resolveCandidateSecurityOntology} from '../../src/extensions/security/ontology-checks-candidate';
import {migrateCandidateSecurityOntology} from '../../src/extensions/security/ontology-migration-candidate';
import {securityFixture} from './fixture';
function fixture(){
 const f=securityFixture(),ontology:any=structuredClone(migrateCandidateSecurityOntology(f.resolution.ontology,'purposes-1').target);
 ontology.actions=['opaque-a','opaque-b','opaque-c','opaque-d','opaque-e','opaque-f'];
 ontology.actionPurposes=ontology.actions.map((action:string,i:number)=>({action,purposes:[['read','field','original-authorized','reverse','vault-write','other'][i]]}));
 return {ontology,documents:f.resolution.documents};
}
const run=(f:ReturnType<typeof fixture>)=>inspectSecurityActionPurposes(f.ontology,f.documents);
const refuse=(f:ReturnType<typeof fixture>)=>{const r=run(f);expect(r.status).toBe('refused');expect(r.purposes).toEqual([]);expect(r.ontology).toEqual(f.ontology);expect(r.documents).toEqual(f.documents as any);return r;};
test('source purposes close the exact opaque action universe, never infer a permission',()=>{
 const f=fixture(),before=structuredClone(f),r=run(f);expect(r.status).toBe('resolved-purposes');expect(r.purposes).toEqual(f.ontology.actionPurposes);expect([r.complete,r.authority]).toEqual([false,false]);expect(Object.isFrozen(r.purposes[0]?.purposes)).toBe(true);expect(f).toEqual(before);
 f.ontology.actionPurposes[0].purposes=['reverse'];expect(r.purposes[0]?.purposes).toEqual(['read']);
 const x=fixture();x.ontology.actionPurposes.reverse();x.ontology.actions.reverse();expect(run(x).status).toBe('resolved-purposes');
});
test('ordinary purposes may combine while reverse, vault-write and other remain exclusive',()=>{
 const f=fixture();f.ontology.actionPurposes[0].purposes=['read','field','original-authorized'];expect(run(f).status).toBe('resolved-purposes');
 for(const secret of ['reverse','vault-write','other'])for(const extra of ['read','field','original-authorized','reverse','vault-write','other'])if(secret!==extra){const x=fixture();x.ontology.actionPurposes[0].purposes=[secret,extra];refuse(x);expect(()=>resolveCandidateSecurityOntology(x.ontology,x.documents)).toThrow();}
});
test('purpose closure refuses incomplete, duplicated, unknown and extra source atomically',()=>{
 for(const mutation of [
  (f:any)=>delete f.ontology.actionPurposes,(f:any)=>f.ontology.actionPurposes=[],(f:any)=>f.ontology.actionPurposes.pop(),
  (f:any)=>f.ontology.actionPurposes.push(f.ontology.actionPurposes[0]),(f:any)=>f.ontology.actionPurposes[0].action='foreign',
  (f:any)=>f.ontology.actionPurposes[0].purposes=[],(f:any)=>f.ontology.actionPurposes[0].purposes=['read','read'],
  (f:any)=>f.ontology.actionPurposes[0].purposes=['unknown'],(f:any)=>f.ontology.actionPurposes[0].native='unknown',
  (f:any)=>f.ontology.actionPurposes[0].purposes=null,(f:any)=>f.ontology.actionPurposes=null,
  (f:any)=>f.ontology.actions.push(f.ontology.actions[0]),(f:any)=>f.ontology.actions.push('unclassified'),
  (f:any)=>f.ontology.actions[0]=false,(f:any)=>f.ontology.actions[0]='',
  (f:any)=>f.documents[0].revision='stale',(f:any)=>f.ontology.version='0.1.0',
 ]){const f=fixture();mutation(f);refuse(f);}
});
test('legacy absence remains legacy and migration invents no action purposes',()=>{
 const f=fixture();delete f.ontology.actionPurposes;expect(()=>resolveCandidateSecurityOntology(f.ontology,f.documents)).not.toThrow();refuse(f);
 const old=securityFixture();const m:any=migrateCandidateSecurityOntology(old.resolution.ontology,'new');expect(Object.hasOwn(m.target,'actionPurposes')).toBe(false);
});
test('no action spelling or policy-grant list supplies missing classification',()=>{
 const f=fixture();f.ontology.actions=['read','reverse'];delete f.ontology.actionPurposes;refuse(f);
 f.ontology.actionPurposes=[{action:'read',purposes:['reverse']},{action:'reverse',purposes:['read']}];expect(run(f).status).toBe('resolved-purposes');
 // This is authored intent only. Actual operation owners must reject any
 // conflicting read/original/write binding, even when the labels look familiar.
 expect(run(f).authority).toBe(false);
});
test('resource exhaustion and hostile accessors refuse without partial purposes',()=>{
 const f=fixture();f.ontology.actionPurposes[0].action='x'.repeat(4_000_001);const r=refuse(f);expect(r.diagnostics.some(d=>d.code==='SECURITY_ACTION_PURPOSE_BOUND')).toBe(true);
 let called=false;const source={get version(){called=true;return '0.2.0';}};const q=inspectSecurityActionPurposes(source,f.documents);expect(q.status).toBe('refused');expect(called).toBe(false);expect(q.purposes).toEqual([]);
});
