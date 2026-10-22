// SPDX-License-Identifier: MIT OR Apache-2.0
// @covers US-079-AC3
import {test,expect} from 'bun:test';
import {securityFixture,ref} from './fixture';
import {migrateCandidateSecurityOntology} from '../../src/extensions/security/ontology-migration-candidate';
import {resolveCandidateSecurityOntology} from '../../src/extensions/security/ontology-checks-candidate';
import {createCandidateEntityTermScope} from '../../src/extensions/security/entity-terms-candidate';
import {normalizeCandidateAssociationExpression,serializeCandidateAssociationExpression,compileCandidateAssociationCondition,requireIssuedCandidateCompactCondition} from '../../src/extensions/security/association-expression';
function fixture(){const f=securityFixture(),ontology:any=structuredClone(migrateCandidateSecurityOntology(f.resolution.ontology,'compact-v2').target);return {...f,ontology,documents:f.resolution.documents};}
test('compact condition preserves exact scoped IR without duplicating source archives',()=>{
 const f=fixture(),checked=resolveCandidateSecurityOntology(f.ontology,f.documents),scope=createCandidateEntityTermScope(f.ontology,f.documents,ref('Resource')),n=normalizeCandidateAssociationExpression(f.policy.rules[1]!.condition,checked.associations,undefined,scope),old:any=serializeCandidateAssociationExpression(n),compact:any=compileCandidateAssociationCondition(n,checked.associations);
 expect(compact.expression).toEqual(old.expression);expect(Object.keys(compact)).toEqual(['kind','expression']);expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(old).length);expect(Object.isFrozen(compact.expression)).toBe(true);expect(()=>requireIssuedCandidateCompactCondition(compact,checked.associations,scope)).not.toThrow();expect(()=>requireIssuedCandidateCompactCondition(structuredClone(compact),checked.associations,scope)).toThrow();
 const reversed:any=compileCandidateAssociationCondition(n,[...checked.associations].reverse());expect(reversed.expression.association).toBe(1);expect(reversed.expression.where.args[1].association).toBe(0);expect(reversed.expression.where.args[1].where.args[1].right.occurrence).toBe(0);
 expect(()=>requireIssuedCandidateCompactCondition(compact,[...checked.associations].reverse(),scope)).toThrow();
 expect(()=>requireIssuedCandidateCompactCondition(compact,checked.associations)).toThrow();
 expect(()=>requireIssuedCandidateCompactCondition(compact,checked.associations,createCandidateEntityTermScope(f.ontology,f.documents,ref('Resource')))).toThrow();
 expect(()=>requireIssuedCandidateCompactCondition(reversed,[...checked.associations].reverse(),scope)).not.toThrow();
});
test('compact emitter refuses residuals, copied handles, missing unused declarations and hostile tables',()=>{
 const f=fixture(),checked=resolveCandidateSecurityOntology(f.ontology,f.documents),scope=createCandidateEntityTermScope(f.ontology,f.documents,ref('Resource')),n=normalizeCandidateAssociationExpression({op:'literal',value:true},checked.associations,undefined,scope);
 for(const table of [[],[checked.associations[0]],checked.associations.map(c=>({...c})),[checked.associations[0],checked.associations[0]]])expect(()=>compileCandidateAssociationCondition(n,table as any)).toThrow();expect(()=>compileCandidateAssociationCondition({...n},checked.associations)).toThrow();
 const residual=normalizeCandidateAssociationExpression(f.policy.rules[1]!.condition,checked.associations);expect(()=>compileCandidateAssociationCondition(residual,checked.associations)).toThrow();
 let calls=0;const bad=[] as any[];Object.defineProperty(bad,'0',{get(){calls++;return checked.associations[0];}});expect(()=>compileCandidateAssociationCondition(n,bad)).toThrow();expect(calls).toBe(0);
});
test('graph Record and opaque witnesses retain native side/role meaning in compact IR',()=>{
 for(const opaque of [false,true]){const f=fixture(),document:any=f.documents[0]!.document,relationship={documentId:'domain',moduleId:'m',relationshipId:'WorksOn'};document.modules[0].relationships=[{id:'WorksOn',name:'WorksOn',sourceMultiplicity:{min:0,max:1},targetMultiplicity:{min:0,max:2},targetLifecycle:'independent',directed:true,source:[{module:'m',element:'Staff'}],target:[{module:'m',element:'Project',key:'pk'}],...(!opaque?{associationRecord:{module:'m',element:'Assignment'}}:{})}];
 f.ontology.associations=[{kind:'core-relationship',relationship,witness:opaque?{kind:'opaque-existential'}:{kind:'record-key',type:ref('Assignment'),keyId:'pk'},endpoints:[{role:'staff',side:'source',target:ref('Staff'),keyId:'pk'},{role:'project',side:'target',target:ref('Project'),keyId:'pk'}]}];
 const checked=resolveCandidateSecurityOntology(f.ontology,f.documents),scope=createCandidateEntityTermScope(f.ontology,f.documents,ref('Resource')),n=normalizeCandidateAssociationExpression({op:'exists',association:relationship,as:'edge',where:{op:'eq',left:{kind:'variable',name:'edge',endpoint:'staff'},right:{kind:'subject',identity:true}}},checked.associations,undefined,scope),compact:any=compileCandidateAssociationCondition(n,checked.associations),old:any=serializeCandidateAssociationExpression(n);
 expect(compact.expression).toEqual(old.expression);expect(compact.expression.where.left.term.relationship).toEqual(relationship);expect(compact.expression.where.left.term.side).toBe('source');expect(compact.expression.where.left.term.fields).toBeUndefined();
 }
});
