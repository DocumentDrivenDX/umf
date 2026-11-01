// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {inspectSecurityActionPurposes} from '../../src/index-node-v4';
import {migrateCandidateSecurityOntology} from '../../src/extensions/security/ontology-migration-candidate';
import {securityFixture} from './fixture';

function fixture(){
 const f=securityFixture(),ontology:any=structuredClone(migrateCandidateSecurityOntology(f.resolution.ontology,'purposes-rust-1').target);
 ontology.actions=['opaque-a','opaque-b','opaque-c','opaque-d','opaque-e','opaque-f'];
 ontology.actionPurposes=ontology.actions.map((action:string,i:number)=>({action,purposes:[['read','field','original-authorized','reverse','vault-write','other'][i]]}));
 return {ontology,documents:f.resolution.documents};
}

test('Node V4 action-purpose inspection validates a full authored closure through Rust',()=>{
 const f=fixture(),before=structuredClone(f),report=inspectSecurityActionPurposes(f.ontology,f.documents);
 expect(report.status,JSON.stringify(report)).toBe('resolved-purposes');expect(report.purposes).toEqual(f.ontology.actionPurposes);
 expect([report.complete,report.authority]).toEqual([false,false]);expect(f).toEqual(before);
});

test('Node V4 action-purpose inspection refuses incomplete closure without partial labels',()=>{
 const f=fixture();f.ontology.actionPurposes.pop();const report=inspectSecurityActionPurposes(f.ontology,f.documents);
 expect(report.status,JSON.stringify(report)).toBe('refused');expect(report.purposes).toEqual([]);expect(report.diagnostics.some(d=>d.severity==='error')).toBe(true);
});
