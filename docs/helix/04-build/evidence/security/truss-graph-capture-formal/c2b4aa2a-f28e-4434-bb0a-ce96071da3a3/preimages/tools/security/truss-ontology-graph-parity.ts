/** Inspection bridge; no source/issuer authority or public API. */
import {lowerSecurityRowPredicate} from './security-predicate';
import {createCandidateGraphSource} from './security-graph-source';
const {artifact}=JSON.parse(await Bun.stdin.text());
const ontology=JSON.parse(artifact.request.ontologyJson),document=JSON.parse(artifact.request.modules[0].documentJson);
const elements=new Map(document.modules[0].elements.map((e:any)=>[e.id,e]));
const specs:any={Staff:{kind:'object',typeId:'1',owner:'1',fields:[['staffId','101','id','string'],['login','102','native_login','string']]},Project:{kind:'object',typeId:'2',owner:'2',fields:[['projectId','201','id','string']]},Resource:{kind:'object',typeId:'3',owner:'3',fields:[['resourceId','301','id','string']]},Assignment:{kind:'edge',typeId:'41',owner:'4',fields:[['assignmentStaff','401','employee_id','string'],['assignmentProject','402','project_id','string'],['active','403','active','boolean']]},Ownership:{kind:'edge',typeId:'51',owner:'5',fields:[['ownerResource','501','resource_id','string'],['ownerProject','502','project_id','string']]}};
const qualified=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
const sources:any={};
const types=[...ontology.entities,...ontology.associations].map((t:any)=>{
 const name=t.type.elementId,s=specs[name],record:any=elements.get(name),key=record.keys.find((k:any)=>k.id===t.keyId);
 const column=(id:string)=>{const f=s.fields.find((f:any)=>f[0]===id);if(!f)throw Error('Missing original field');return {ref:qualified(id),column:f[2]};};
 const source=createCandidateGraphSource({kind:s.kind,typeId:s.typeId,propertyOwnerTypeId:s.owner,fields:s.fields.map((f:any)=>({propertyId:f[1],column:f[2],scalar:f[3]}))});sources[name]=source;
 return {type:t.type,keyId:t.keyId,keyFields:key.fields.map((f:any)=>column(f.element)),fields:t.fields.filter((f:any)=>s.fields.some((x:any)=>x[0]===f.ref.elementId)).map((f:any)=>column(f.ref.elementId)),endpoints:t.endpoints,home:{source}};
});
const sql=lowerSecurityRowPredicate({logicalPlan:artifact.handoff.securityLogicalPlan,action:'read',target:qualified('Resource'),subject:ontology.subject,subjectLoginColumn:'native_login',types});
process.stdout.write(JSON.stringify({version:'umf.security.graph-parity-candidate/0.1.0',sql,sources,specs})+'\n');
