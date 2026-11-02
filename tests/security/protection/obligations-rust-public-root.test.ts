// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {inspectProtectionObligations} from '../../../src/index-node-v4';
import {migrateCandidateSecurityOntology} from '../../../src/extensions/security/ontology-migration-candidate';
import {securityFixture,ref} from '../fixture';

function fixture(){
 const f=securityFixture(),ontology:any=structuredClone(migrateCandidateSecurityOntology(f.resolution.ontology,'ontology-purposes-rust').target);
 const purposes:any={read:'read',update:'field',reverse:'reverse','vault-write':'vault-write','query-original':'original-authorized','field-access':'field',custom:'other'};
 ontology.actions=Object.keys(purposes);ontology.actionPurposes=ontology.actions.map((action:string)=>({action,purposes:[purposes[action]]}));
 const policy:any=structuredClone(f.policy);policy.version='0.2.0';policy.ontology.revision=ontology.revision;policy.protection={id:'c',revision:'c1'};
 policy.rules[0].disclosure[0].disposition={kind:'transformed',vocabulary:'umf.security.protection',transform:'token',version:'1',field:ref('resourceId')};
 const catalog:any={vocabulary:'umf.security.protection',version:'0.1.0',id:'c',revision:'c1',transforms:[{id:'token',version:'1',kind:'tokenize',inputDomain:ref('salary'),outputDomain:ref('resourceId'),determinism:'deterministic',reversibility:'vault',disclosureProfile:[],queryUse:{},parameters:[],reverseAction:'reverse',custody:{owner:'declared-owner',vaultRef:'opaque',formatPreserving:false,storageEffect:'stored-transformed',propagation:{history:'declared-history',snapshots:'declared-snapshots',exports:'declared-exports',feeds:'declared-feeds',caches:'declared-caches'},vaultWriteAction:'vault-write'}}],native:{opaque:'no execution'}};
 return {policy,catalog,ontology,closure:{pins:structuredClone(ontology.documents),documents:f.resolution.documents}};
}

test('Node V4 protection obligations retain the full unverified custody declaration set',()=>{
 const f=fixture(),report=inspectProtectionObligations(f.policy,f.catalog,f.closure,f.ontology);
 expect(report.status,JSON.stringify(report)).toBe('declared-obligations');expect([report.complete,report.authority]).toEqual([false,false]);
 expect(report.obligations.map(item=>item.kind)).toEqual(['stored-custody','propagation','propagation','propagation','propagation','propagation','vault-write-action','reverse-action']);
 expect(report.obligations.every(item=>item.status==='unverified')).toBe(true);
});

test('Node V4 protection obligations refuse a reverse action with an ordinary purpose',()=>{
 const f=fixture();f.ontology.actionPurposes.find((entry:any)=>entry.action==='reverse').purposes=['read'];
 const report=inspectProtectionObligations(f.policy,f.catalog,f.closure,f.ontology);
 expect(report.status,JSON.stringify(report)).toBe('refused');expect(report.obligations).toEqual([]);expect(report.diagnostics.some(item=>item.severity==='error')).toBe(true);
});
