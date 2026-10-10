import {test,expect} from 'bun:test';
import {securityFixture} from './fixture';
import {resolveCandidateAssociationChecks} from '../../src/extensions/security/association-checks';
import {createCandidateAssociationScope,bindCandidateAssociationWitness,resolveCandidateAssociationWitnessTerm,resolveCandidateAssociationScopeTerm} from '../../src/extensions/security/association-witness';
test('lexical witness occurrences retain term correlation and reject shadowing or forged custody',()=>{
 const {resolution}=securityFixture(),a=resolution.ontology.associations[1]!,checks=resolveCandidateAssociationChecks({kind:'record-members',type:a.type,keyId:a.keyId,endpoints:a.endpoints},resolution.documents[0]!.document,resolution.ontology.entities.map(e=>({type:e.type,keyId:e.keyId})),[...resolution.ontology.entities.filter(e=>['Staff','Project'].includes(e.type.elementId)),a].map(e=>({type:e.type,fields:e.fields})));
 const root=createCandidateAssociationScope(),first=bindCandidateAssociationWitness(root,checks,'a'),sibling=bindCandidateAssociationWitness(root,checks,'a');
 const endpoint=resolveCandidateAssociationWitnessTerm(first.witness,{kind:'endpoint',role:'staff'}),attribute=resolveCandidateAssociationWitnessTerm(first.witness,{kind:'attribute',field:a.fields.find(f=>f.ref.elementId==='active')!.ref});
 expect(endpoint.witness).toBe(attribute.witness);expect(first.witness).not.toBe(sibling.witness);expect(Object.isFrozen(endpoint)).toBe(true);
 expect(()=>bindCandidateAssociationWitness(first.scope,checks,'a')).toThrow();expect(()=>bindCandidateAssociationWitness({...root},checks,'b')).toThrow();expect(()=>bindCandidateAssociationWitness(root,{...checks},'b')).toThrow();
 expect(()=>resolveCandidateAssociationWitnessTerm({...first.witness},{kind:'identity'})).toThrow();
 expect(()=>resolveCandidateAssociationWitnessTerm(first.witness,{kind:'attribute',field:resolution.ontology.entities[0]!.fields[0]!.ref})).toThrow();
 expect(bindCandidateAssociationWitness(first.scope,checks,'b').witness.name).toBe('b');
 expect(()=>resolveCandidateAssociationScopeTerm(root,'a',{kind:'identity'})).toThrow();
 expect(resolveCandidateAssociationScopeTerm(first.scope,'a',{kind:'identity'}).witness).toBe(first.witness);
 expect(resolveCandidateAssociationScopeTerm(sibling.scope,'a',{kind:'identity'}).witness).toBe(sibling.witness);
 expect(()=>resolveCandidateAssociationScopeTerm({...first.scope},'a',{kind:'identity'})).toThrow();
 let calls=0;const hostile:any={kind:'attribute'};Object.defineProperty(hostile,'field',{enumerable:true,get(){calls++;return a.fields[0]!.ref;}});expect(()=>resolveCandidateAssociationScopeTerm(first.scope,'a',hostile)).toThrow();expect(calls).toBe(0);
});
