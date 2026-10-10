/** Explicit shared-home primitive bridge; native/profile qualification is separate. */
import {lowerSecurityRowPredicate,type SecurityPhysicalType} from '/Users/erik/Projects/truss/packages/postgresql/src/security-predicate.ts';
const {artifact,mutation}=JSON.parse(await Bun.stdin.text());
const ontology=JSON.parse(artifact.request.ontologyJson),document=JSON.parse(artifact.request.modules[0].documentJson);
const elements=new Map<string,any>(document.modules[0].elements.map((e:any)=>[e.id,e]));
const columns:Record<string,Record<string,string>>={Staff:{staffId:'id'},Project:{projectId:'id'},Resource:{resourceId:'id'},Assignment:{assignmentStaff:'source_key',assignmentProject:'target_key',active:'active'},Ownership:{ownerResource:'source_key',ownerProject:'target_key'}};
const values:Record<string,string>={Staff:'1',Project:'2',Resource:'3',Assignment:'11',Ownership:'12'};
const qualified=(elementId:string)=>({documentId:'domain',moduleId:'m',elementId});
const types:SecurityPhysicalType[]=[...ontology.entities,...ontology.associations].map((t:any)=>{
 const name=t.type.elementId,key=elements.get(name).keys.find((k:any)=>k.id===t.keyId);
 const field=(id:string)=>({ref:qualified(id),column:columns[name]![id]!});
 return {type:t.type,keyId:t.keyId,keyFields:key.fields.map((f:any)=>field(f.element)),fields:t.fields.filter((f:any)=>columns[name]![f.ref.elementId]).map((f:any)=>field(f.ref.elementId)),home:{schema:'shared_component',table:'entity'},discriminator:{column:'type_id',carrier:'int4',value:values[name]!},endpoints:t.endpoints};
});
// Explicit names instead of lexical/numeric conversion of native stored IDs.
for(const t of types)t.home.table=['Staff','Project','Resource'].includes(t.type.elementId)?'entity':'association';
const input={logicalPlan:artifact.handoff.securityLogicalPlan,action:'read',target:qualified('Resource'),subject:ontology.subject,subjectLoginColumn:'native_login',types,resourceDiscriminatorParameter:2 as number|undefined};
if(mutation==='missing-root')input.resourceDiscriminatorParameter=undefined;
if(mutation==='overlap')types.find(t=>t.type.elementId==='Project')!.discriminator!.value='1';
if(mutation==='missing-selection')delete types.find(t=>t.type.elementId==='Project')!.discriminator;
if(mutation==='wrong-column')types.find(t=>t.type.elementId==='Project')!.discriminator!.column='other_type';
if(mutation==='wrong-carrier')types.find(t=>t.type.elementId==='Project')!.discriminator!.carrier='int8';
if(mutation==='noncanonical')types.find(t=>t.type.elementId==='Project')!.discriminator!.value='02';
if(mutation==='overflow')types.find(t=>t.type.elementId==='Project')!.discriminator!.value='2147483648';
process.stdout.write(JSON.stringify({version:'truss.security.type-selection/0.1.0',sql:lowerSecurityRowPredicate(input)})+'\n');
