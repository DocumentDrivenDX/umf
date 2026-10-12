import {test,expect} from 'bun:test';
import {securityFixture,ref} from './fixture';
import {migrateCandidateSecurityOntology} from '../../src/extensions/security/ontology-migration-candidate';
import {createCandidateEntityTermScope,resolveCandidateEntityTerm,candidateEntityTermsCompatible} from '../../src/extensions/security/entity-terms-candidate';
function fixture(){const f=securityFixture(),ontology:any=structuredClone(migrateCandidateSecurityOntology(f.resolution.ontology,'ontology-2').target);ontology.associations=[];ontology.context=[ref('active')];return {ontology,documents:f.resolution.documents};}
test('intrinsic entity identities and attributes resolve without any association',()=>{
 const {ontology,documents}=fixture(),scope=createCandidateEntityTermScope(ontology,documents,ref('Resource'));
 const subject:any=resolveCandidateEntityTerm(scope,{kind:'subject',identity:true}),resource:any=resolveCandidateEntityTerm(scope,{kind:'resource',identity:true});
 expect(subject.term.type).toEqual(ref('Staff'));expect(resource.term.type).toEqual(ref('Resource'));expect(candidateEntityTermsCompatible(subject,resource)).toBe(false);
 const salary=resolveCandidateEntityTerm(scope,{kind:'resource',field:ref('salary')}),constant:any=resolveCandidateEntityTerm(scope,{kind:'constant',field:ref('salary'),value:{integerToken:'9007199254740993'}});
 expect(candidateEntityTermsCompatible(salary,constant)).toBe(true);expect(constant.term.value).toEqual({integerToken:'9007199254740993'});expect(Object.isFrozen(constant.term.value)).toBe(true);
 const context=resolveCandidateEntityTerm(scope,{kind:'context',field:ref('active')}),flag=resolveCandidateEntityTerm(scope,{kind:'constant',field:ref('active'),value:{boolean:true}});expect(candidateEntityTermsCompatible(context,flag)).toBe(true);expect(candidateEntityTermsCompatible(salary,flag)).toBe(false);
});
test('intrinsic terms reject wrong owners, undeclared context and coercible constants',()=>{
 const {ontology,documents}=fixture(),scope=createCandidateEntityTermScope(ontology,documents,ref('Resource'));
 for(const term of [{kind:'subject',field:ref('salary')},{kind:'resource',field:ref('staffId')},{kind:'context',field:ref('salary')},{kind:'constant',field:ref('salary'),value:{string:'9007199254740993'}},{kind:'constant',field:ref('salary'),value:{integerToken:'1.5'}},{kind:'resource',identity:false},{kind:'context',identity:true},{kind:'resource',identity:true,future:true}])expect(()=>resolveCandidateEntityTerm(scope,term)).toThrow();
 expect(()=>createCandidateEntityTermScope(ontology,documents,ref('missing'))).toThrow();
});
test('explicit alternate primary metadata does not replace selected identity Key',()=>{
 const {ontology,documents}=fixture(),resource:any=documents[0]!.document.modules[0]!.elements.find(e=>e.id==='Resource');resource.keys[0].primary=false;resource.keys.push({id:'salary-key',name:'Salary key',fields:[{module:'m',element:'salary'}],primary:true});
 const scope=createCandidateEntityTermScope(ontology,documents,ref('Resource')),term:any=resolveCandidateEntityTerm(scope,{kind:'resource',identity:true});expect(term.term.key.id).toBe('pk');expect(term.term.key.primary).toBe(false);expect(term.term.key.fields).toEqual([{module:'m',element:'resourceId'}]);
});
test('issued scopes and terms cannot be copied or composed across source cuts',()=>{
 const {ontology,documents}=fixture(),scope:any=createCandidateEntityTermScope(ontology,documents,ref('Resource')),other=createCandidateEntityTermScope(ontology,documents,ref('Resource')),term:any=resolveCandidateEntityTerm(scope,{kind:'resource',identity:true});
 expect(()=>resolveCandidateEntityTerm({...scope},{kind:'resource',identity:true})).toThrow();expect(()=>candidateEntityTermsCompatible({...term},term)).toThrow();expect(()=>candidateEntityTermsCompatible(term,resolveCandidateEntityTerm(other,{kind:'resource',identity:true}))).toThrow();
 let calls=0;const hostile={kind:'resource',get identity(){calls++;return true;}};expect(()=>resolveCandidateEntityTerm(scope,hostile)).toThrow();expect(calls).toBe(0);
 ontology.subject=ref('Project');(documents[0]!.document.modules[0]!.elements.find(e=>e.id==='resourceId') as any).scalarType='boolean';expect((resolveCandidateEntityTerm(scope,{kind:'subject',identity:true}) as any).term.type).toEqual(ref('Staff'));expect((resolveCandidateEntityTerm(scope,{kind:'resource',identity:true}) as any).domain).toContain('string');
});
