// SPDX-License-Identifier: MIT OR Apache-2.0
import {catalogRuntimeFixture,graphRuntimeFixture} from './catalog-runtime-fixture';
import {ref} from './fixture';
export function catalogWriteFixture(graph=false,opaque=false){
 const f=graph?graphRuntimeFixture(opaque):catalogRuntimeFixture();
 const actions=['create','delete','write-fields','change-owner','change-policy','blind-fields'];f.ontology.actions.push(...actions);f.ontology.actionPurposes.push(...actions.map(action=>({action,purposes:['field']})));const ordinary=['create','update','delete','write-fields','change-owner','change-policy'];
 f.policy.rules.push({id:'writer',effect:'permit',actions:[...ordinary,'blind-fields'],target:f.ontology.entities.map((e:any)=>e.type),condition:{op:'literal',value:true}}, {...structuredClone(f.policy.rules[1]),id:'write-membership',actions:[...ordinary,'blind-fields']});
 const profile:any={version:'umf.security.catalog-write/0.1',id:'write-profile',revision:'1',owner:{id:f.owner.id,revision:f.owner.revision},types:f.ontology.entities.map((e:any)=>({type:e.type,createAction:'create',updateAction:'update',deleteAction:'delete',fieldActions:e.fields.map((p:any)=>({field:p.ref,action:'write-fields'})),policyAction:'change-policy',policyFields:e.fields.map((p:any)=>p.ref),ownershipAction:'change-owner',ownershipFields:[],readProtection:{version:'umf.security.write-read/0.1.0',readAction:'read',blindWriteActions:e.fields.map((p:any)=>({field:p.ref,action:'blind-fields'}))}})),associations:f.ontology.associations.map((a:any)=>({source:{kind:a.kind,ref:a.kind==='core-relationship'?a.relationship:a.type},mode:'immutable'}))};
 const before=structuredClone(f.cut),after=structuredClone(f.cut);before.maxSteps=after.maxSteps=1000000;after.facts.find((r:any)=>r.type.elementId==='Resource').fields.find((p:any)=>p.field.elementId==='salary').value={integerToken:'200'};
 const request:any={version:'umf.security.catalog-transaction/0.1',profile:{id:profile.id,revision:profile.revision},before,after,mutations:[{operation:'update',type:ref('Resource'),key:[{string:'r1'}]}],maxSteps:1000000,maxFacts:1000};
 return {...f,profile,request};
}
export function deleteOwnedResource(f:ReturnType<typeof catalogWriteFixture>){
 f.request.mutations[0].operation='delete';f.request.after.facts=f.request.after.facts.filter((r:any)=>r.type.elementId!=='Resource');
 const binding=f.profile.associations[0];binding.mode='owned';binding.ownerType=ref('Resource');binding.anchor={kind:'endpoint',role:'resource'};
 if(f.ontology.associations[0].kind==='core-relationship')f.request.after.graphs=f.request.after.graphs.filter((r:any)=>r.relationship.relationshipId!=='OwnedBy');
 else{f.request.after.facts=f.request.after.facts.filter((r:any)=>r.type.elementId!=='Ownership');f.request.mutations.push({operation:'delete',type:ref('Ownership'),key:[{string:'o1'}]});}
 return f;
}
export function storedWriteFixture(){
 const f=catalogWriteFixture(),elements=f.closure.documents[0].document.modules[0].elements;elements.push({id:'clear',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{}},{id:'token',kind:'field',scalarType:'string',cardinality:'one',nullability:'required',extensions:{}});elements.find((e:any)=>e.id==='Resource').members.push({module:'m',element:'token'});f.ontology.entities.find((e:any)=>e.type.elementId==='Resource').fields.push({ref:ref('token'),protection:'protected'});
 f.ontology.actions.push('reverse','vault-write');f.ontology.actionPurposes.push({action:'reverse',purposes:['reverse']},{action:'vault-write',purposes:['vault-write']});f.catalog={vocabulary:'umf.security.protection',version:'0.1.0',id:'stored',revision:'1',transforms:[{id:'vault',version:'1',kind:'tokenize',inputDomain:ref('clear'),outputDomain:ref('token'),determinism:'random',reversibility:'vault',reverseAction:'reverse',disclosureProfile:[],queryUse:{},parameters:[],custody:{owner:'host',vaultRef:'vault',vaultWriteAction:'vault-write',formatPreserving:false,storageEffect:'stored-transformed',propagation:{history:'declared',snapshots:'declared',exports:'declared',feeds:'declared',caches:'declared'}}}]};f.policy.protection={id:'stored',revision:'1'};
 f.owner.storage.push({type:ref('Resource'),field:ref('token'),storageEffect:'stored-transformed',storageTransform:{id:'vault',version:'1'}});const p=f.profile.types.find((p:any)=>p.type.elementId==='Resource');p.fieldActions.push({field:ref('token'),action:'write-fields'});p.policyFields.push(ref('token'));p.readProtection.blindWriteActions.push({field:ref('token'),action:'blind-fields'});
 for(const [i,cut] of [f.request.before,f.request.after].entries()){cut.protection={id:'stored',revision:'1'};cut.coverage.find((c:any)=>c.type.elementId==='Resource').fields.push(ref('token'));cut.facts.find((r:any)=>r.type.elementId==='Resource').fields.push({field:ref('token'),value:{string:i?'new-token':'old-token'}});}
 return f;
}
