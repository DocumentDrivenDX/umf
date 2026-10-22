// SPDX-License-Identifier: MIT OR Apache-2.0
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {currentProductsSourceFixture} from './core-extension-closure-fixture';
import {preparationSourceArtifact as artifact,type PreparationSourceArtifact,type PreparationSourceInputs} from '../../tools/security/protection-preparation-sources';
const raw=(name:string):PreparationSourceArtifact=>{const utf8=readFileSync(new URL('./preparation-program-original/'+name,import.meta.url),'utf8');return {mediaType:'application/json',utf8,sha256:createHash('sha256').update(utf8).digest('hex')};};
export function preparationSourcesFixture():PreparationSourceInputs{
 const f=currentProductsSourceFixture(),target=f.ontology.entities.find(e=>e.type.elementId==='products')!,readAction='bulk-prepare-read',ordinary={create:'products-create',update:'products-update',delete:'products-delete',policy:'products-policy-change',ownership:'products-owner-change'},fieldActions=target.fields.map(f=>({field:f.ref,action:f.ref.elementId==='product-id'?'product-id-write':'product-name-write'}));
 const names=[...Object.values(ordinary),...fieldActions.map(f=>f.action)];f.ontology.actions.push(...names);f.ontology.actionPurposes.push(...names.map(action=>({action,purposes:['field']})));
 f.policy.rules[1]!.actions=[ordinary.update,'product-name-write'];
 const owner={version:'umf.security.logical-owner/0.1',id:'products-owner',revision:'1',storage:f.ontology.entities.flatMap(e=>e.fields.map(field=>({type:e.type,field:field.ref,storageEffect:'canonical'}))),disclosure:{readAction}};
 const profile={version:'umf.security.catalog-write/0.1',id:'products-write',revision:'1',owner:{id:owner.id,revision:owner.revision},types:[{type:target.type,createAction:ordinary.create,updateAction:ordinary.update,deleteAction:ordinary.delete,fieldActions,policyAction:ordinary.policy,policyFields:[],ownershipAction:ordinary.ownership,ownershipFields:[],readProtection:{version:'umf.security.write-read/0.1.0',readAction,blindWriteActions:[]}}],associations:[]};
 const subjectMapping={version:'truss.preparation-subject/0.1-candidate',type:f.ontology.subject,keyId:'pk',field:{...f.ontology.subject,elementId:'principal-id'},carrier:'truss.action_subject_binding.principal_identity/canonical-json-string-utf8',authenticationProfile:'truss.local-scram/0.1',subjectKind:'human',codec:'umf-key-tuple-v1/encode-core-key-tuple/4.0.0'};
 const bindingEnvelope=raw('program-binding.json');
 return {policy:artifact(f.policy),ontology:artifact(f.ontology),catalog:null,coreClosure:artifact(f.closure),bindings:artifact([]),owner:artifact(owner),writeProfile:artifact(profile),subjectMapping:artifact(subjectMapping),configuration:raw('program-configuration.json'),request:raw('program-request.json'),compileResponse:raw('program-compile-response.json'),binding:JSON.parse(bindingEnvelope.utf8),bindingEnvelope,loweringInvocation:raw('program-lowering-invocation.json')};
}
