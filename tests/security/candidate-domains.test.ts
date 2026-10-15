// @covers US-079-AC3
// @covers US-079-AC16
import {test,expect} from 'bun:test';
import {securityFixture,ref} from './fixture';
import {migrateCandidateSecurityOntology} from '../../src/extensions/security/ontology-migration-candidate';
import {createCandidateEntityTermScope,resolveCandidateEntityTerm,candidateEntityTermsCompatible} from '../../src/extensions/security/entity-terms-candidate';
import {resolveCandidateSecurityOntology} from '../../src/extensions/security/ontology-checks-candidate';
import {normalizeCandidateAssociationExpression,serializeCandidateAssociationExpression} from '../../src/extensions/security/association-expression';
import {resolveCandidateSecurityPolicy} from '../../src/extensions/security/policy-checks-candidate';
function fixture(){const f=securityFixture();return {...f,ontology:structuredClone(migrateCandidateSecurityOntology(f.resolution.ontology,'domains-v2').target) as any,documents:f.resolution.documents};}
const field=(f:any,id:string)=>f.documents[0].document.modules[0].elements.find((e:any)=>e.id===id);
const domain=(f:any,id='dto-amount')=>{f.documents[0].document.modules[0].elements.push({id,kind:'field',scalarType:'integer',cardinality:'one',nullability:'absent-allowed',extensions:{}});return ref(id);};
test('nullable intrinsic attributes and null constants retain exact declared domains',()=>{
 const f=fixture();field(f,'salary').nullability='absent-allowed';
 const scope=createCandidateEntityTermScope(f.ontology,f.documents,ref('Resource'));
 const attribute:any=resolveCandidateEntityTerm(scope,{kind:'resource',field:ref('salary')}),nil:any=resolveCandidateEntityTerm(scope,{kind:'constant',field:ref('salary'),value:null});
 expect(candidateEntityTermsCompatible(attribute,nil)).toBe(true);expect(nil.term.value).toBeNull();expect(attribute.domain).toContain('absent-allowed');
 const required=fixture(),s=createCandidateEntityTermScope(required.ontology,required.documents,ref('Resource'));expect(()=>resolveCandidateEntityTerm(s,{kind:'constant',field:ref('salary'),value:null})).toThrow();
});
test('domain-only Field constants resolve from the exact core closure without acquiring live ownership',()=>{
 const f=fixture();field(f,'salary').nullability='absent-allowed';const dto=domain(f),scope=createCandidateEntityTermScope(f.ontology,f.documents,ref('Resource'));
 const literal:any=resolveCandidateEntityTerm(scope,{kind:'constant',field:dto,value:null}),actual=resolveCandidateEntityTerm(scope,{kind:'resource',field:ref('salary')});
 expect(candidateEntityTermsCompatible(actual,literal)).toBe(true);expect(literal.term.field).toEqual(dto);expect(Object.isFrozen(literal)).toBe(true);
 for(const term of [{kind:'resource',field:dto},{kind:'subject',field:dto},{kind:'context',field:dto}])expect(()=>resolveCandidateEntityTerm(scope,term)).toThrow();
 expect(()=>resolveCandidateEntityTerm(scope,{kind:'constant',field:{...dto,documentId:'foreign'},value:null})).toThrow();
});
test('nullable witness attributes use the same exact scalar domain without loosening endpoint Keys',()=>{
 const f=fixture(),document=f.documents[0]!.document;domain(f,'ownerNote');field(f,'ownerNote').scalarType='string';field(f,'Ownership').members.push({module:'m',element:'ownerNote'});f.ontology.entities.find((e:any)=>e.type.elementId==='Ownership').fields.push({ref:ref('ownerNote'),protection:'unprotected'});
 const checked=resolveCandidateSecurityOntology(f.ontology,f.documents),scope=createCandidateEntityTermScope(f.ontology,f.documents,ref('Resource'));
 const n=normalizeCandidateAssociationExpression({op:'exists',association:ref('Ownership'),as:'owner',where:{op:'eq',left:{kind:'variable',name:'owner',field:ref('ownerNote')},right:{kind:'constant',field:ref('ownerNote'),value:null}}},checked.associations,undefined,scope);
 expect(n.residuals).toEqual([]);const wire:any=serializeCandidateAssociationExpression(n);expect(wire.expression.where.right.term.value).toBeNull();expect(wire.expression.where.left.term.field).toEqual(ref('ownerNote'));
 field(f,'ownerId').nullability='absent-allowed';expect(()=>resolveCandidateSecurityOntology(f.ontology,f.documents)).toThrow();
 expect(document.modules[0]!.elements.some((e:any)=>e.id==='ownerNote')).toBe(true);
});
test('inline constant output may use a domain-only nullable Field but its disclosed input must be live',()=>{
 const f=fixture(),dto=domain(f),p:any=structuredClone(f.policy);p.version='0.2.0';p.ontology.revision=f.ontology.revision;p.rules[0].disclosure[0].disposition={kind:'transformed',transform:'constant',version:'0.1.0',field:dto,value:null};
 const result:any=resolveCandidateSecurityPolicy(p,f.ontology,f.documents);expect(result.residuals).toEqual([]);expect(result.policy.rules[0].disclosure[0].disposition.field).toEqual(dto);
 p.rules[0].disclosure[0].field=dto;expect(()=>resolveCandidateSecurityPolicy(p,f.ontology,f.documents)).toThrow();
});
test('nullable domains remain exact and original model/source cuts cannot be mixed',()=>{
 const f=fixture();field(f,'salary').nullability='absent-allowed';const dto=domain(f),scope=createCandidateEntityTermScope(f.ontology,f.documents,ref('Resource'));
 const left=resolveCandidateEntityTerm(scope,{kind:'resource',field:ref('salary')});field(f,'dto-amount').nullability='required';
 const other=createCandidateEntityTermScope(f.ontology,f.documents,ref('Resource'));expect(()=>candidateEntityTermsCompatible(left,resolveCandidateEntityTerm(other,{kind:'constant',field:dto,value:{integerToken:'1'}}))).toThrow();
 expect((resolveCandidateEntityTerm(scope,{kind:'constant',field:dto,value:null}) as any).term.value).toBeNull();
 const key=fixture();field(key,'resourceId').nullability='absent-allowed';expect(()=>createCandidateEntityTermScope(key.ontology,key.documents,ref('Resource'))).toThrow();
});
test('explicit DTO-only context Fields are exact closure domains, never live entity attributes',()=>{
 const f=fixture(),dto=domain(f);f.ontology.context=[dto];
 const scope=createCandidateEntityTermScope(f.ontology,f.documents,ref('Resource'));
 const context:any=resolveCandidateEntityTerm(scope,{kind:'context',field:dto}),literal=resolveCandidateEntityTerm(scope,{kind:'constant',field:dto,value:null});expect(candidateEntityTermsCompatible(context,literal)).toBe(true);
 expect(()=>resolveCandidateEntityTerm(scope,{kind:'resource',field:dto})).toThrow();
 for(const bad of [ref('Resource'),ref('missing'),{...dto,documentId:'foreign'}]){const x=fixture();x.ontology.context=[bad];expect(()=>createCandidateEntityTermScope(x.ontology,x.documents,ref('Resource'))).toThrow();}
});
