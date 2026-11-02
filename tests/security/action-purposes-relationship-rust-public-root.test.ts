// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {inspectSecurityActionPurposes} from '../../src/index-node-v4';
import {migrateCandidateSecurityOntology} from '../../src/extensions/security/ontology-migration-candidate';
import {securityFixture} from './fixture';

function fixture(){
 const f=securityFixture(),ontology:any=structuredClone(migrateCandidateSecurityOntology(f.resolution.ontology,'graph-purpose-rust-1').target),document=f.resolution.documents[0]!.document;
 document.modules[0]!.relationships=[{id:'WorksOn',name:'WorksOn',directed:true,sourceMultiplicity:{min:0,max:1},targetMultiplicity:{min:0,max:2},targetLifecycle:'independent',source:[{module:'m',element:'Staff'}],target:[{module:'m',element:'Project',key:'pk'}],associationRecord:{module:'m',element:'Assignment'}}];
 ontology.associations[1]={kind:'core-relationship',relationship:{documentId:'domain',moduleId:'m',relationshipId:'WorksOn'},witness:{kind:'record-key',type:{documentId:'domain',moduleId:'m',elementId:'Assignment'},keyId:'pk'},endpoints:[{role:'staff',side:'source',target:ontology.subject,keyId:'pk'},{role:'project',side:'target',target:{documentId:'domain',moduleId:'m',elementId:'Project'},keyId:'pk'}]};
 ontology.actions=['relationship-purpose'];ontology.actionPurposes=[{action:'relationship-purpose',purposes:['read']}];
 return {ontology,documents:f.resolution.documents};
}

test('Node V4 action-purpose inspection validates a Record-key core relationship through Rust',()=>{
 const f=fixture(),report=inspectSecurityActionPurposes(f.ontology,f.documents);
 expect(report.status,JSON.stringify(report)).toBe('resolved-purposes');expect(report.purposes).toEqual(f.ontology.actionPurposes);
 expect([report.complete,report.authority]).toEqual([false,false]);
});

test('Node V4 action-purpose inspection refuses a graph endpoint with a mismatched Key',()=>{
 const f=fixture();f.ontology.associations[1]!.endpoints[1]!.keyId='missing';
 const report=inspectSecurityActionPurposes(f.ontology,f.documents);
 expect(report.status,JSON.stringify(report)).toBe('refused');expect(report.purposes).toEqual([]);
 expect(report.diagnostics.some((d:any)=>d.severity==='error')).toBe(true);
});
