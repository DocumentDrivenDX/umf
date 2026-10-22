// SPDX-License-Identifier: MIT OR Apache-2.0
import {evaluationFixture} from './evaluation-fixture';
import {ref} from './fixture';
import {migrateCandidateSecurityOntology} from '../../src/extensions/security/ontology-migration-candidate';
import {compileCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
export function catalogRuntimeFixture(){
 const f=evaluationFixture(),ontology:any=structuredClone(migrateCandidateSecurityOntology(f.resolution.ontology,'runtime-v2').target),policy:any={...structuredClone(f.policy),version:'0.2.0',ontology:{documentId:'domain',revision:'runtime-v2'}};
 ontology.actionPurposes=[{action:'read',purposes:['read']},{action:'update',purposes:['field']}];policy.rules[0].disclosure[0].disposition={kind:'original'};
 const closure:any={pins:[{documentId:'domain',revision:'schema-1'}],documents:structuredClone(f.resolution.documents)},owner:any={version:'umf.security.logical-owner/0.1',id:'owner',revision:'owner-1',storage:ontology.entities.flatMap((e:any)=>e.fields.map((field:any)=>({type:e.type,field:field.ref,storageEffect:'canonical'})))};
 const project={type:ref('Project'),key:[{string:'p1'}],fields:[{field:ref('projectId'),value:{string:'p1'}}],absent:[]};
 const cut:any={version:'umf.security.logical-facts/0.1',trusted:true,generation:'g1',expectedGeneration:'g1',policy:{id:policy.id,revision:policy.revision},ontology:policy.ontology,protection:null,domains:closure.pins,owner:{id:owner.id,revision:owner.revision},subject:{type:ref('Staff'),key:[{string:'alice'}]},facts:[f.cut.subjects[0],project,f.resource,f.owner,f.assignment],graphs:[],coverage:ontology.entities.map((e:any)=>({type:e.type,complete:true,fields:e.fields.map((x:any)=>x.ref)})),graphCoverage:[],context:[],valueProfiles:[],maxFacts:100,maxSteps:100000};
 const request:any={action:'read',resources:[{type:ref('Resource'),key:[{string:'r1'}]}],targets:[ref('Resource')],fields:[ref('salary')]};
 return {policy,catalog:null as any,ontology,closure,owner,cut,request};
}
export const compileRuntimeFixture=(f:ReturnType<typeof catalogRuntimeFixture>)=>compileCandidateCatalogProgram(f.policy,f.catalog,f.closure,f.ontology);
export function graphRuntimeFixture(opaque=false){
 const f=catalogRuntimeFixture(),document=f.closure.documents[0].document;
 const relation=(id:string,source:string,witness:string)=>({id,name:id,directed:true,sourceMultiplicity:{min:0,max:1},targetMultiplicity:{min:0,max:2},targetLifecycle:'independent',source:[{module:'m',element:source}],target:[{module:'m',element:'Project',key:'pk'}],...(!opaque?{associationRecord:{module:'m',element:witness}}:{})});
 document.modules[0].relationships=[relation('OwnedBy','Resource','Ownership'),relation('WorksOn','Staff','Assignment')];
 const rr=(relationshipId:string)=>({documentId:'domain',moduleId:'m',relationshipId});
 f.ontology.associations=f.ontology.associations.map((a:any)=>({kind:'core-relationship',relationship:rr(a.type.elementId==='Ownership'?'OwnedBy':'WorksOn'),witness:opaque?{kind:'opaque-existential'}:{kind:'record-key',type:a.type,keyId:'pk'},endpoints:a.endpoints.map((e:any,i:number)=>({role:e.role,side:i===0?'source':'target',target:e.target,keyId:'pk'}))}));
 function rewrite(x:any):void{if(x.op==='exists'){x.association=rr(x.association.elementId==='Ownership'?'OwnedBy':'WorksOn');rewrite(x.where);}else if(x.op==='and'||x.op==='or')x.args.forEach(rewrite);else if(x.op==='not')rewrite(x.arg);}
 if(opaque)f.policy.rules[1].condition.where.args[1].where.args.pop();rewrite(f.policy.rules[1].condition);
 f.cut.graphs=[{relationship:rr('OwnedBy'),witness:opaque?{kind:'opaque-existential',id:'same'}:{kind:'record-key',type:ref('Ownership'),key:[{string:'o1'}]},endpoints:[{role:'resource',key:[{string:'r1'}]},{role:'project',key:[{string:'p1'}]}]},{relationship:rr('WorksOn'),witness:opaque?{kind:'opaque-existential',id:'same'}:{kind:'record-key',type:ref('Assignment'),key:[{string:'a1'}]},endpoints:[{role:'staff',key:[{string:'alice'}]},{role:'project',key:[{string:'p1'}]}]}];
 f.cut.graphCoverage=f.ontology.associations.map((a:any)=>({relationship:a.relationship,complete:true,roles:a.endpoints.map((e:any)=>e.role),fields:opaque?[]:f.ontology.entities.find((e:any)=>e.type.elementId===a.witness.type.elementId).fields.map((x:any)=>x.ref)}));return f;
}
