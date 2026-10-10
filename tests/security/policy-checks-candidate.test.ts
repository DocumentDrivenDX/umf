import {test,expect} from 'bun:test';
import {securityFixture} from './fixture';
import {migrateCandidateSecurityOntology} from '../../src/extensions/security/ontology-migration-candidate';
import {migrateCandidateSecurityPolicy} from '../../src/extensions/security/policy-migration-candidate';
import {candidateSecurityPolicyDependencies} from '../../src/extensions/security/dependencies-candidate';
import {resolveCandidateSecurityPolicy} from '../../src/extensions/security/policy-checks-candidate';
import {inspectCandidateAssociationExpressionTransport} from '../../src/extensions/security/association-expression';
function fixture(){const f=securityFixture(),ontology:any=migrateCandidateSecurityOntology(f.resolution.ontology,'ontology-2').target,policy:any=migrateCandidateSecurityPolicy(f.policy,{documentId:'domain',revision:'ontology-2'},'policy-2').target,bindings=[{ruleId:'membership',target:policy.rules[1].target[0],context:{subject:{association:f.resolution.ontology.associations[1]!.type,endpoint:'staff'},resource:{association:f.resolution.ontology.associations[0]!.type,endpoint:'resource'}}}];return {f,ontology,policy,bindings};}
test('whole policy validates action/target/disclosure closure and typed nested correlation',()=>{const {f,ontology,policy,bindings}=fixture(),result:any=resolveCandidateSecurityPolicy(policy,ontology,f.resolution.documents,bindings);expect(result.residuals).toEqual([]);expect(result.conditions).toHaveLength(2);expect(result.conditions[1].transport.expression.where.args[1].where.args[1].right.occurrence).toBe(0);expect(Object.isFrozen(result.policy)).toBe(true);const unresolved:any=resolveCandidateSecurityPolicy(policy,ontology,f.resolution.documents);expect(unresolved.residuals).toEqual([]);});
test('whole policy refuses wrong revisions, actions, targets, disclosures and contextual types',()=>{for(const mutation of ['revision','action','duplicate-rule','duplicate-action','target','disclosure-owner','duplicate-disclosure','require-disclosure','subject','resource','unknown','unused-binding']){const {f,ontology,policy:original,bindings:initial}=fixture(),policy=structuredClone(original),bindings:any=structuredClone(initial);if(mutation==='revision')policy.ontology.revision='stale';if(mutation==='action')policy.rules[0].actions=['unknown'];if(mutation==='duplicate-rule')policy.rules.push(policy.rules[0]);if(mutation==='duplicate-action')policy.rules[0].actions.push('read');if(mutation==='target')policy.rules[0].target[0].elementId='missing';if(mutation==='disclosure-owner')policy.rules[0].disclosure[0].field.elementId='staffId';if(mutation==='duplicate-disclosure')policy.rules[0].disclosure.push(policy.rules[0].disclosure[0]);if(mutation==='require-disclosure')policy.rules[1].disclosure=[];if(mutation==='subject')bindings[0].context.subject.endpoint='project';if(mutation==='resource')bindings[0].context.resource.endpoint='project';if(mutation==='unknown')policy.rules[0].constructor={future:true};if(mutation==='unused-binding')bindings[0].ruleId='missing';expect(()=>resolveCandidateSecurityPolicy(policy,ontology,f.resolution.documents,bindings)).toThrow();}});


test('whole policy retains graph Relationship scope and Record-backed attributes',()=>{
 const {f,ontology:originalOntology,policy:originalPolicy,bindings:originalBindings}=fixture(),ontology=structuredClone(originalOntology),policy=structuredClone(originalPolicy),bindings:any=structuredClone(originalBindings),a=f.resolution.ontology.associations[1]!;
 f.resolution.documents[0]!.document.modules[0]!.relationships=[{id:'WorksOn',name:'WorksOn',directed:true,sourceMultiplicity:{min:0,max:1},targetMultiplicity:{min:0,max:2},targetLifecycle:'independent',source:[{module:'m',element:'Staff'}],target:[{module:'m',element:'Project',key:'pk'}],associationRecord:{module:'m',element:'Assignment'}}];
 const relationship={documentId:'domain',moduleId:'m',relationshipId:'WorksOn'};ontology.associations[1]={kind:'core-relationship',relationship,witness:{kind:'record-key',type:a.type,keyId:a.keyId},endpoints:a.endpoints.map((e,i)=>({role:e.role,side:i===0?'source':'target',target:e.target,keyId:'pk'}))};policy.rules[1].condition.where.args[1].association=relationship;bindings[0].context.subject.association=relationship;
 const result:any=resolveCandidateSecurityPolicy(policy,ontology,f.resolution.documents,bindings);expect(result.residuals).toEqual([]);expect(result.conditions[1].transport.expression.where.args[1].where.args[1].left.term.relationship).toEqual(relationship);const dependencies:any=candidateSecurityPolicyDependencies(result);expect(dependencies.graphIncidences.map((e:any)=>e.side).sort()).toEqual(['source','target']);expect(dependencies.graphWitnessRecords[0].type.elementId).toBe('Assignment');expect(dependencies.fields.some((r:any)=>r.elementId==='assignmentStaff')).toBe(false);
 const inner=policy.rules[1].condition.where.args[1];inner.where.args.push({op:'eq',left:{kind:'variable',name:'a',identity:true},right:{kind:'variable',name:'a',identity:true}});const identityDependencies:any=candidateSecurityPolicyDependencies(resolveCandidateSecurityPolicy(policy,ontology,f.resolution.documents,bindings));expect(identityDependencies.fields.some((r:any)=>r.elementId==='assignmentId')).toBe(true);expect(identityDependencies.graphIncidences).toHaveLength(2);
 inner.where.args.splice(2);delete (f.resolution.documents[0]!.document.modules[0]!.relationships as any)[0].associationRecord;ontology.associations[1].witness={kind:'opaque-existential'};const opaqueDependencies:any=candidateSecurityPolicyDependencies(resolveCandidateSecurityPolicy(policy,ontology,f.resolution.documents,bindings));expect(opaqueDependencies.graphWitnessRecords).toEqual([]);expect(opaqueDependencies.fields.some((r:any)=>r.elementId==='active')).toBe(false);

});

test('constant disclosure validates exact output literals without integer coercion',()=>{
 const {f,ontology,policy:original,bindings}=fixture(),policy=structuredClone(original);policy.rules[0].disclosure[0].disposition={kind:'transformed',transform:'constant',version:'0.1.0',field:policy.rules[0].disclosure[0].field,value:{integerToken:'9007199254740993'}};
 const result:any=resolveCandidateSecurityPolicy(policy,ontology,f.resolution.documents,bindings);expect(result.policy.rules[0].disclosure[0].disposition.value).toEqual({integerToken:'9007199254740993'});
 for(const value of [{string:'9007199254740993'},{integerToken:'1.5'},{integerToken:9007199254740992}]){const changed=structuredClone(policy);changed.rules[0].disclosure[0].disposition.value=value;expect(()=>resolveCandidateSecurityPolicy(changed,ontology,f.resolution.documents,bindings)).toThrow();}
});


test('expression node limit applies once to the policy document across rules',()=>{
 const tree=(count:number)=>{const groups=Math.ceil((count-1)/65),leaves=count-1-groups;return {op:'and',args:Array.from({length:groups},(_,i)=>({op:'and',args:Array.from({length:i<groups-1?64:leaves-64*(groups-1)},()=>({op:'literal',value:true}))}))};};
 for(const sizes of [[2048,2048],[2048,2049],[2113,2113]]){const {f,ontology,policy:original}=fixture(),policy=structuredClone(original);policy.rules[0].condition=tree(sizes[0]!);policy.rules[1].condition=tree(sizes[1]!);if(sizes[0]!+sizes[1]!!==4096)expect(()=>resolveCandidateSecurityPolicy(policy,ontology,f.resolution.documents)).toThrow();else expect((resolveCandidateSecurityPolicy(policy,ontology,f.resolution.documents) as any).residuals).toEqual([]);}
});


test('document node count does not multiply by rule target count',()=>{
 const {f,ontology,policy:original}=fixture(),policy=structuredClone(original),condition={op:'and',args:Array.from({length:32},(_,i)=>({op:'and',args:Array.from({length:i===31?31:64},()=>({op:'literal',value:true}))}))};
 for(const rule of policy.rules){rule.condition=condition;rule.target.push({documentId:'domain',moduleId:'m',elementId:'Project'});delete rule.disclosure;}expect((resolveCandidateSecurityPolicy(policy,ontology,f.resolution.documents) as any).conditions).toHaveLength(4);
});


test('dependency closure retains live association fields and refuses copied or unresolved results',()=>{
 const {f,ontology,policy,bindings}=fixture(),checked=resolveCandidateSecurityPolicy(policy,ontology,f.resolution.documents,bindings),dependencies:any=candidateSecurityPolicyDependencies(checked);
 expect(dependencies.fields.map((r:any)=>r.elementId).sort()).toEqual(['active','assignmentProject','assignmentStaff','ownerProject','ownerResource','projectId','resourceId','staffId'].sort());expect(dependencies.associations.map((r:any)=>r.type.elementId).sort()).toEqual(['Assignment','Ownership']);expect(dependencies.graphIncidences).toEqual([]);expect(Object.isFrozen(dependencies.fields)).toBe(true);
 expect(()=>candidateSecurityPolicyDependencies({...checked as any})).toThrow();expect(candidateSecurityPolicyDependencies(resolveCandidateSecurityPolicy(policy,ontology,f.resolution.documents))).toEqual(dependencies);
 const literal=structuredClone(policy);literal.rules[1].condition={op:'literal',value:true};expect((candidateSecurityPolicyDependencies(resolveCandidateSecurityPolicy(literal,ontology,f.resolution.documents)) as any).fields).toEqual([]);
});


test('constant domain references do not become live read dependencies',()=>{
 const {f,ontology,policy:original}=fixture(),policy=structuredClone(original),field={documentId:'domain',moduleId:'m',elementId:'salary'},constant={kind:'constant',field,value:{integerToken:'9007199254740993'}};policy.rules[1].condition={op:'eq',left:constant,right:constant};const dependencies:any=candidateSecurityPolicyDependencies(resolveCandidateSecurityPolicy(policy,ontology,f.resolution.documents));expect(dependencies.fields).toEqual([]);expect(dependencies.associations).toEqual([]);
});

test('standalone Record conditions transport intrinsic fields and trusted context dependencies',()=>{
 const {f,ontology:originalOntology,policy:original}=fixture(),ontology=structuredClone(originalOntology),policy=structuredClone(original);ontology.associations=[];ontology.context=[{documentId:'domain',moduleId:'m',elementId:'active'}];policy.rules=policy.rules.slice(0,1);
 const salary={documentId:'domain',moduleId:'m',elementId:'salary'},active={documentId:'domain',moduleId:'m',elementId:'active'};
 policy.rules[0].condition={op:'and',args:[{op:'eq',left:{kind:'resource',field:salary},right:{kind:'constant',field:salary,value:{integerToken:'9007199254740993'}}},{op:'eq',left:{kind:'context',field:active},right:{kind:'constant',field:active,value:{boolean:true}}}]};
 const checked:any=resolveCandidateSecurityPolicy(policy,ontology,f.resolution.documents),wire=checked.conditions[0].transport,dependencies:any=candidateSecurityPolicyDependencies(checked);
 expect(checked.residuals).toEqual([]);expect(wire.kind).toBe('candidate-association-expression-transport/0.2');expect(wire.associations).toEqual([]);expect(inspectCandidateAssociationExpressionTransport(JSON.parse(JSON.stringify(wire)))).toEqual(wire);expect(dependencies.fields).toEqual([salary]);expect(dependencies.contextFields).toEqual([active]);expect(dependencies.associations).toEqual([]);
 for(const mutate of [(w:any)=>w.expression.args[0].left.domain='scalar:forged',(w:any)=>w.expression.args[0].left.term.field.elementId='staffId',(w:any)=>w.entities.target.elementId='Staff',(w:any)=>w.entities.ontology.context=[],(w:any)=>w.entities.future=true,(w:any)=>w.kind='candidate-association-expression-transport/0.1']){const changed=structuredClone(wire);mutate(changed);expect(()=>inspectCandidateAssociationExpressionTransport(changed)).toThrow();}
});

test('intrinsic nominal identity compares against exact correlated association endpoints',()=>{
 const {f,ontology,policy}=fixture(),checked:any=resolveCandidateSecurityPolicy(policy,ontology,f.resolution.documents),wire=checked.conditions[1].transport;
 expect(inspectCandidateAssociationExpressionTransport(JSON.parse(JSON.stringify(wire)))).toEqual(wire);expect(wire.expression.where.args[0].right.term.type.elementId).toBe('Resource');expect(wire.expression.where.args[1].where.args[0].right.term.type.elementId).toBe('Staff');
 const wrong=structuredClone(policy);wrong.rules[1].condition.where.args[0].right={kind:'subject',identity:true};expect(()=>resolveCandidateSecurityPolicy(wrong,ontology,f.resolution.documents)).toThrow();
});
