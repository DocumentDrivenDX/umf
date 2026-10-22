import {test,expect} from 'bun:test';
import {securityFixture} from './fixture';
import {migrateCandidateSecurityOntology} from '../../src/extensions/security/ontology-migration-candidate';
import {resolveCandidateSecurityOntology} from '../../src/extensions/security/ontology-checks-candidate';
test('whole migrated ontology resolves original Keys, classifications and association sources',()=>{
 const f=securityFixture(),migration=migrateCandidateSecurityOntology(f.resolution.ontology,'ontology-2'),result:any=resolveCandidateSecurityOntology(migration.target,f.resolution.documents);expect(result.associations).toHaveLength(2);expect(result.ontology.entities).toHaveLength(5);expect(Object.isFrozen(result.documents[0].document)).toBe(true);
});
test('whole ontology refuses incoherent revisions, declarations and unresolved semantics',()=>{
 for(const mutation of ['stale','missing-document','duplicate-document','duplicate-pin','duplicate-entity','key','missing-field','subject','context','duplicate-action','association-key','duplicate-association','unknown']){const f=securityFixture(),ontology:any=structuredClone(migrateCandidateSecurityOntology(f.resolution.ontology,'ontology-2').target),documents:any=structuredClone(f.resolution.documents);
 if(mutation==='stale')documents[0].revision='stale';if(mutation==='missing-document')documents.pop();if(mutation==='duplicate-document')documents.push(documents[0]);if(mutation==='duplicate-pin')ontology.documents.push(ontology.documents[0]);if(mutation==='duplicate-entity')ontology.entities.push(ontology.entities[0]);if(mutation==='key')ontology.entities[0].keyId='missing';if(mutation==='missing-field')ontology.entities[0].fields=[];if(mutation==='subject')ontology.subject.elementId='missing';if(mutation==='context')ontology.context=[{documentId:'foreign',moduleId:'m',elementId:'missing'}];if(mutation==='duplicate-action')ontology.actions.push(ontology.actions[0]);if(mutation==='association-key')ontology.associations[0].keyId='other';if(mutation==='duplicate-association')ontology.associations.push(ontology.associations[0]);if(mutation==='unknown')ontology.entities[0].constructor={meaning:'unknown'};
 expect(()=>resolveCandidateSecurityOntology(ontology,documents)).toThrow();
 }
});

test('one ontology supports member associations and both graph witness forms',()=>{
 for(const recordBacked of [true,false]){const f=securityFixture(),ontology:any=structuredClone(migrateCandidateSecurityOntology(f.resolution.ontology,'ontology-2').target),document=f.resolution.documents[0]!.document;
 document.modules[0]!.relationships=[{id:'WorksOn',name:'WorksOn',directed:true,sourceMultiplicity:{min:0,max:1},targetMultiplicity:{min:0,max:2},targetLifecycle:'independent',source:[{module:'m',element:'Staff'}],target:[{module:'m',element:'Project',key:'pk'}],...(recordBacked?{associationRecord:{module:'m',element:'Assignment'}}:{})}];
 ontology.associations[1]={kind:'core-relationship',relationship:{documentId:'domain',moduleId:'m',relationshipId:'WorksOn'},witness:recordBacked?{kind:'record-key',type:{documentId:'domain',moduleId:'m',elementId:'Assignment'},keyId:'pk'}:{kind:'opaque-existential'},endpoints:[{role:'staff',side:'source',target:ontology.subject,keyId:'pk'},{role:'project',side:'target',target:{documentId:'domain',moduleId:'m',elementId:'Project'},keyId:'pk'}]};
 const result:any=resolveCandidateSecurityOntology(ontology,f.resolution.documents);expect(result.associations[0].kind).toBe('candidate-record-association-checks/0.1');expect(result.associations[1].plan.witness.kind).toBe(recordBacked?'record-key':'opaque-existential');
 }
});
