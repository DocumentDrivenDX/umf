import {CURRENT_CORE_VERSION} from '../../../src/generated/core-model';
/** Authored fixed native profile. Decisions remain logical, never SQL credentials. */
import type {CoreLiteral} from '../../../src/model/schema-literals';
import type {SecurityWriteState} from '../../../src/extensions/security/write';
import {evaluateSecurityWrite} from '../../../src/extensions/security/write';
import {compileCandidateCatalogProgram} from '../../../src/extensions/security/catalog-program-candidate';
import {evaluateCandidateCatalogWrite} from '../../../src/extensions/security/catalog-write-candidate';
import {migrateCandidateSecurityOntology} from '../../../src/extensions/security/ontology-migration-candidate';
const ref=(elementId:string)=>({documentId:'mask-write',moduleId:'m',elementId});
export function maskWriteSources(){
 const fields:any[]=[['staffId','string','required'],['readClass','string','required'],['normal','boolean','required'],['field','boolean','required'],['blind','boolean','required'],['resourceId','string','required'],['amount','integer','absent-allowed']].map(([id,scalarType,nullability])=>({id,kind:'field',scalarType,nullability,cardinality:'one',extensions:{},...(id==='amount'?{facets:{integerWidth:{bits:64,signed:true}}}:id==='readClass'?{allowedValues:['original','masked','withheld','denied'].map(string=>({string}))}:{})}));
 const members={Staff:['staffId','readClass','normal','field','blind'],Resource:['resourceId','amount']};
 const entities=Object.entries(members).map(([name,names])=>({type:ref(name),keyId:'pk',fields:names.map(name=>({ref:ref(name),protection:name==='amount'?'protected':'unprotected'}))}));
 const document:any={umf:CURRENT_CORE_VERSION,id:'mask-write',vocabularies:{},modules:[{id:'m',namespace:'',elements:[...fields,...Object.entries(members).map(([id,names])=>({id,kind:'record',members:names.map(element=>({module:'m',element})),keys:[{id:'pk',name:'Key',fields:[{module:'m',element:names[0]}]}],extensions:{}}))]}]};
 const actions=['read','create','update','delete','writeKey','writeAmount','changePolicy','changeOwner','blindAmount'];
 const ontology:any={version:'0.1.0',documentId:'mask-write-ontology',revision:'legacy1',documents:[{documentId:document.id,revision:'schema1'}],subject:ref('Staff'),entities,associations:[],context:[],actions};
 const eq=(field:string,value:any)=>({op:'eq',left:{kind:'subject',field:ref(field)},right:{kind:'constant',field:ref(field),value}});
 const policy:any={vocabulary:'umf.security',version:'0.1.0',id:'mask-write-policy',revision:'legacy1',ontology:{documentId:ontology.documentId,revision:ontology.revision},rules:[
  ...['original','masked','withheld'].map(readClass=>({id:'read-'+readClass,effect:'permit',actions:['read'],target:[ref('Resource')],condition:eq('readClass',{string:readClass}),disclosure:[{field:ref('amount'),disposition:readClass==='original'?{kind:'original'}:readClass==='withheld'?{kind:'withheld'}:{kind:'transformed',transform:'constant',version:'0.1.0',field:ref('amount'),value:{integerToken:'0'}}}]})),
  {id:'object-update',effect:'permit',actions:['update'],target:[ref('Resource')],condition:eq('normal',{boolean:true})},
  {id:'field-update',effect:'permit',actions:['writeKey','writeAmount'],target:[ref('Resource')],condition:eq('field',{boolean:true})},
  {id:'blind-update',effect:'permit',actions:['blindAmount'],target:[ref('Resource')],condition:eq('blind',{boolean:true})}
 ]};
 const profile:any={type:ref('Resource'),createAction:'create',updateAction:'update',deleteAction:'delete',fieldActions:[{field:ref('resourceId'),action:'writeKey'},{field:ref('amount'),action:'writeAmount'}],policyAction:'changePolicy',policyFields:[],ownershipAction:'changeOwner',ownershipFields:[],ownershipAssociations:[],readProtection:{version:'umf.security.write-read/0.1.0',readAction:'read',blindWriteActions:[{field:ref('amount'),action:'blindAmount'}]}};
 const resolution={ontology,documents:[{document,revision:'schema1'}]},canonicalOntology:any=structuredClone(migrateCandidateSecurityOntology(ontology,'canonical1').target);canonicalOntology.actionPurposes=actions.map(action=>({action,purposes:[action==='read'?'read':'field']}));
 const canonicalPolicy={...structuredClone(policy),version:'0.2.0',revision:'canonical1',ontology:{documentId:ontology.documentId,revision:'canonical1'}};
 const closure={pins:[{documentId:document.id,revision:'schema1'}],documents:resolution.documents};
 const owner={version:'umf.security.logical-owner/0.1',id:'mask-write-owner',revision:'1',storage:entities.flatMap(e=>e.fields.map(f=>({type:e.type,field:f.ref,storageEffect:'canonical'})))};
 const {ownershipAssociations:legacyAssociations,...currentTypeProfile}=profile;
 const currentProfile={version:'umf.security.catalog-write/0.1',id:'mask-write-profile',revision:'1',owner:{id:owner.id,revision:owner.revision},types:[currentTypeProfile],associations:[]};
 return {policy,resolution,profile,canonicalPolicy,canonicalOntology,closure,owner,currentProfile};
}
export function evaluateMaskWriteInputs(input:any){
 const f=maskWriteSources(),program=compileCandidateCatalogProgram(f.canonicalPolicy,null,f.closure,f.canonicalOntology);
 const fact=(type:string,key:string,values:Record<string,CoreLiteral>)=>({type:ref(type),key:[{string:key}],fields:Object.entries(values).map(([name,value])=>({field:ref(name),value})),absent:[]});
 const subjects=input.subjects.map((s:any)=>fact('Staff',s.login,{staffId:{string:s.login},readClass:{string:s.readClass},normal:{boolean:s.normal},field:{boolean:s.field},blind:{boolean:s.blind}}));
 const amount=(v:any):CoreLiteral=>v===null?null:{integerToken:v};
 const resource=(v:any)=>fact('Resource','r1',{resourceId:{string:'r1'},amount:amount(v)});
 const coverage=f.resolution.ontology.entities.map((e:any)=>({type:e.type,complete:true,fields:e.fields.map((x:any)=>x.ref)}));
 const results=input.vectors.map((v:any)=>{
  const subject=subjects.find((s:any)=>s.key[0].string===v.actor);if(!subject)throw Error('Actual subject missing');
  const legacy=(value:any):SecurityWriteState=>({resource:resource(value),cut:{trusted:true,generation:'g1',expectedGeneration:'g1',policyId:f.policy.id,policyRevision:f.policy.revision,ontologyDocumentId:f.resolution.ontology.documentId,ontologyRevision:f.resolution.ontology.revision,subjects:[subject],facts:[],coverage,context:[],maxFacts:100,maxSteps:1000000}});
  const current=(value:any)=>({version:'umf.security.logical-facts/0.1',trusted:true,generation:'g1',expectedGeneration:'g1',policy:{id:f.canonicalPolicy.id,revision:f.canonicalPolicy.revision},ontology:f.canonicalPolicy.ontology,protection:null,domains:f.closure.pins,owner:{id:f.owner.id,revision:f.owner.revision},subject:{type:ref('Staff'),key:subject.key},facts:[...subjects,resource(value)],graphs:[],coverage,graphCoverage:[],context:[],valueProfiles:[],maxFacts:100,maxSteps:1000000});
  const before=JSON.stringify(f),legacyResult=evaluateSecurityWrite(f.policy,f.resolution,f.profile,{operation:'update',original:legacy(v.before),proposed:legacy(v.proposed)}),currentResult=evaluateCandidateCatalogWrite(program,f.owner,f.currentProfile,{version:'umf.security.catalog-transaction/0.1',profile:{id:f.currentProfile.id,revision:f.currentProfile.revision},before:current(v.before),after:current(v.proposed),mutations:[{operation:'update',type:ref('Resource'),key:[{string:'r1'}]}],maxFacts:100,maxSteps:1000000});
  if(JSON.stringify(f)!==before)throw Error('Source mutated');
  return {id:v.id,legacy:legacyResult.decision,current:currentResult.decision,complete:currentResult.complete,authority:currentResult.authority};
 });return {sources:f,results};
}
if(import.meta.main){const input=await Bun.stdin.text();console.log(JSON.stringify(input?evaluateMaskWriteInputs(JSON.parse(input)):maskWriteSources()));}
