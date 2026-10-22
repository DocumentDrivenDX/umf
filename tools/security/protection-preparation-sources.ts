import {CURRENT_CORE_VERSION} from '../../src/generated/core-model';
/** Host-side source compiler prototype. Output is never a native permission. */
import {createHash} from 'node:crypto';
import {copyJson} from '../../src/model/json';
import {readJsonValue} from '../../src/model/serialization';
import {canonicalSchemaJson} from '../../src/model/schema-literals';
import {encodeCoreKeyTuple} from '../../src/model/key-tuple';
import {compileCandidateCatalogProgram,readCandidateCatalogProgram} from '../../src/extensions/security/catalog-program-candidate';
import {createCandidateCoreExtensionClosure} from '../../src/extensions/security/core-extension-closure-candidate';
export interface PreparationSourceArtifact {mediaType:'application/json';utf8:string;sha256:string}
export interface PreparationSourceInputs {
 policy:PreparationSourceArtifact;ontology:PreparationSourceArtifact;catalog:PreparationSourceArtifact|null;
 coreClosure:PreparationSourceArtifact;bindings:PreparationSourceArtifact;owner:PreparationSourceArtifact;
 writeProfile:PreparationSourceArtifact;subjectMapping:PreparationSourceArtifact;
 configuration:PreparationSourceArtifact;request:PreparationSourceArtifact;compileResponse:PreparationSourceArtifact;
 binding:PreparationSourceArtifact;bindingEnvelope:PreparationSourceArtifact;loweringInvocation:PreparationSourceArtifact;
}
export interface PreparationFieldRef {documentId:string;moduleId:string;elementId:string}
export interface PreparationSubjectMapping {
 version:'truss.preparation-subject/0.1-candidate';type:PreparationFieldRef;keyId:string;field:PreparationFieldRef;
 carrier:'truss.action_subject_binding.principal_identity/canonical-json-string-utf8';
 authenticationProfile:'truss.local-scram/0.1';subjectKind:'human';codec:'umf-key-tuple-v1/encode-core-key-tuple/4.0.0';
}
export interface PreparationSourceObligations {
 protocol:'truss.preparation-source-obligations/0.1-candidate';complete:false;authority:false;
 nativeProfile:'truss.preparation.literal-rbac/0.1-candidate';compilerProfile:typeof PREPARATION_COMPILER_PROFILE;
 original:PreparationSourceInputs;extensionClosure:unknown;target:PreparationFieldRef;subjectMapping:PreparationSubjectMapping;
 nativeFields:{field:PreparationFieldRef;typeId:string;propertyId:string}[];
 readRequirements:{field:PreparationFieldRef;action:string;disposition:'original'}[];
 writeRequirements:{field:PreparationFieldRef;objectAction:string;fieldAction:string;originalReadAction:string;states:['before','after']}[];
 actionRoles:{pin:unknown;profile:{id:'umf.actions.roles';version:'1'};roles:string[];personRequired:true};
 nativeObligations:[{kind:'literal-policy';status:'lowered-source';rules:unknown[]},{kind:'native-identity-and-current-authority';status:'required';checks:string[]}];
}
export const PREPARATION_COMPILER_PROFILE=Object.freeze({sourceCommit:'c0c6449481a87eed38d3f7a6ebebc1f4ab4beeb4',moduleSha256:'2f91cbd5de07f04492d6fdbd964bf86cce84245adc18cd6debe3c17f61ef6843',interfaceVersion:'weft-mutation-compile/0.1.0'});
const originalLoweringObligations=[
 'Current PostgreSQL18.6/layout1.0/tagged runtime0.65 original binding; same original document bytes retain accepted native revision separately from action compilation revision',
 'Host must admit original authenticated authorized coherent source/caller cut, run every complete-population preflight before selection, reject any violations and maxItems+1 overflow without trimming',
 'No connection, raw caller SQL, RR facade, action execution, authorization or publication is issued by this compiler',
];
const fail=(reason:string):never=>{throw Error('PREPARATION_SOURCE_UNSUPPORTED: '+reason);};
const hash=(s:string)=>createHash('sha256').update(s,'utf8').digest('hex');
function scalarText(s:string){for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);if(c>=0xd800&&c<=0xdbff){const n=s.charCodeAt(++i);if(!(n>=0xdc00&&n<=0xdfff))fail('unpaired surrogate in original UTF8 Artifact');}else if(c>=0xdc00&&c<=0xdfff)fail('unpaired surrogate in original UTF8 Artifact');}}
function nativeString(value:any){if(typeof value!=='string'||value.includes('\0'))fail('native String carrier without NUL required');scalarText(value);}
export const preparationSourceArtifact=(value:unknown):PreparationSourceArtifact=>{const utf8=JSON.stringify(copyJson(value));return {mediaType:'application/json',utf8,sha256:hash(utf8)};};
function shape(x:any,keys:string[]){if(!x||typeof x!=='object'||Array.isArray(x)||Object.keys(x).sort().join(',')!==[...keys].sort().join(','))fail('closed shape '+keys.join('/'));}
const same=(a:any,b:any)=>canonicalSchemaJson(a)===canonicalSchemaJson(b);
const id=(r:any)=>{shape(r,['documentId','moduleId','elementId']);if(Object.values(r).some(x=>typeof x!=='string'||!x))fail('exact reference');return canonicalSchemaJson(r);};
function read(input:PreparationSourceArtifact):any{const a=copyJson(input) as unknown as PreparationSourceArtifact;shape(a,['mediaType','utf8','sha256']);if(a.mediaType!=='application/json'||typeof a.utf8!=='string')fail('original JSON Artifact');scalarText(a.utf8);if(Buffer.byteLength(a.utf8)>16*1024*1024||a.sha256!==hash(a.utf8))fail('original bounded Artifact bytes/hash');return readJsonValue(a.utf8,'json');}
const freeze=(x:any):any=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
function subjectDescriptor(mapping:any,closure:any){
 shape(mapping,['version','type','keyId','field','carrier','authenticationProfile','subjectKind','codec']);
 if(mapping.version!=='truss.preparation-subject/0.1-candidate'||mapping.carrier!=='truss.action_subject_binding.principal_identity/canonical-json-string-utf8'||mapping.authenticationProfile!=='truss.local-scram/0.1'||mapping.subjectKind!=='human'||mapping.codec!=='umf-key-tuple-v1/encode-core-key-tuple/4.0.0')fail('Subject carrier/profile');
 id(mapping.type);id(mapping.field);const document=closure.documents.find((d:any)=>d.document.id===mapping.type.documentId)?.document;if(!document)fail('original Subject document');
 const record=document.modules.find((m:any)=>m.id===mapping.type.moduleId)?.elements.find((e:any)=>e.id===mapping.type.elementId),key=record?.keys?.find((k:any)=>k.id===mapping.keyId);
 if(key?.fields?.length!==1||!same({documentId:document.id,moduleId:key.fields[0].module,elementId:key.fields[0].element},mapping.field))fail('one exact Subject String Key');
 const field=document.modules.find((m:any)=>m.id===mapping.field.moduleId)?.elements.find((e:any)=>e.id===mapping.field.elementId);if(field?.scalarType!=='string'||field.cardinality!=='one'||field.nullability!=='required'||Object.keys(field.facets??{}).length||field.allowedValues||field.references?.length||Object.keys(field.extensions??{}).length)fail('native unrefined Subject String Key domain');
 return document;
}
/** Exact first native carrier proposal, derived from opaque reference-string bytes. */
export function derivePreparationSubjectKey(mappingInput:PreparationSourceArtifact,closureInput:PreparationSourceArtifact,principalHex:string){
 const mapping=read(mappingInput),closure=read(closureInput),document=subjectDescriptor(mapping,closure);
 if(typeof principalHex!=='string'||!/^([0-9a-fA-F]{2}){1,4096}$/.test(principalHex))fail('principal byte bound');
 const originalBytes=Uint8Array.from(principalHex.match(/../g)!,s=>parseInt(s,16)),raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(originalBytes),parsed=readJsonValue(raw,'json'),value=typeof parsed==='string'?parsed:fail('String principal required');
 if(raw!==JSON.stringify(value)||!Buffer.from(JSON.stringify(value)).equals(Buffer.from(originalBytes))||value.includes('\0'))fail('canonical native string principal without NUL required');
 const receipt=encodeCoreKeyTuple(document,{module:mapping.type.moduleId,element:mapping.type.elementId,key:mapping.keyId},[{string:value}]);
 return freeze({key:[{string:value}],receipt,authority:false});
}
/** This consumes actual source/compiler artifacts; provenance remains a native guard duty. */
export function compilePreparationSourceObligations(input:PreparationSourceInputs):PreparationSourceObligations{
 const packet:any=copyJson(input);shape(packet,['policy','ontology','catalog','coreClosure','bindings','owner','writeProfile','subjectMapping','configuration','request','compileResponse','binding','bindingEnvelope','loweringInvocation']);
 let total=0;for(const a of Object.values(packet) as any[])if(a){total+=Buffer.byteLength(a.utf8??'');if(total>64*1024*1024)fail('aggregate source byte bound');}
 const policy=read(packet.policy),ontology=read(packet.ontology),closure=read(packet.coreClosure),bindings=read(packet.bindings),owner=read(packet.owner),profile=read(packet.writeProfile),mapping=read(packet.subjectMapping),configuration=read(packet.configuration),request=read(packet.request),response=read(packet.compileResponse),binding=read(packet.binding),invocation=read(packet.loweringInvocation);
 if(!same(read(packet.bindingEnvelope),packet.binding))fail('original raw binding Artifact envelope correspondence');
 if(packet.catalog!==null||Object.hasOwn(policy,'protection'))fail('/catalog: native protection not qualified');
 const extensions=createCandidateCoreExtensionClosure([{id:'umf.actions',version:'0.1.0'}]);
 const source=readCandidateCatalogProgram(compileCandidateCatalogProgram(policy,null,closure,ontology,bindings,extensions));
 if(ontology.associations.length||ontology.context.length||bindings.length)fail('/bindings: native graph/context not qualified');
 shape(request,['interfaceVersion','dialect','sql','parameters','model','modelPin','action','target','selectionProfile','batchSize','limits']);shape(response,['interfaceVersion','status','plan','provenance','diagnostics']);
 if(request.interfaceVersion!=='weft-mutation-compile/0.1.0'||response.interfaceVersion!=='weft-mutation-compile/0.1.0'||request.dialect!=='weft-mutation/0.1.0'||typeof request.sql!=='string'||!request.sql||!Array.isArray(response.diagnostics)||response.diagnostics.length||response.status!=='compiled')fail('original selected compiler interface/dialect/success required');const plan=read(response.plan),model=read(request.model);
 shape(plan,['action','execution','inputs','limits','model','protocol','selection','source','target']);
 shape(plan.model,['documentId','revision','sha256','umfVersion']);shape(plan.action,['documentSha256','identity','invocation']);shape(plan.action.identity,['module','action']);shape(plan.target,['module','element','key']);if(!same(plan.action.invocation,{id:'umf.actions.tx',version:'1'}))fail('original invocation profile');
 if(plan.protocol!=='umf.actions.plan/1'||!same(plan.model,request.modelPin)||plan.model.sha256!==request.model.sha256||model.id!==plan.model.documentId||!same(plan.action,request.action)||!same(plan.target,request.target)||!same(plan.limits,request.limits))fail('model/action/target/limits correspondence');
 if(model.umf!==CURRENT_CORE_VERSION||plan.model.umfVersion!==model.umf||!Number.isSafeInteger(request.batchSize)||request.batchSize<1||request.batchSize>100)fail('selected current core/batch bound');
 if(plan.action.documentSha256!==request.model.sha256||!same(read(plan.source),{dialect:request.dialect,parameters:request.parameters,sql:request.sql})||!same(plan.execution,{atomicity:'batch',batchSize:request.batchSize,conflict:'stop',partition:'manifest-order',selection:'frozen'})||!same(plan.selection.profile,{id:'weft.update-selection',version:'1'})||!same(request.selectionProfile,plan.selection.profile))fail('original source/execution/selection profile');
 shape(response.provenance,['action','assignments','entityParameter','parameters','sourceSha256']);
 if(!same(response.provenance.action,plan.action)||response.provenance.entityParameter!==plan.inputs.entityParameter||response.provenance.sourceSha256!==plan.source.sha256||!same(read(response.provenance.parameters),request.parameters)||!same(response.provenance.assignments,plan.inputs.assignments.map((a:any,ordinal:number)=>({field:a.field,input:a.input,ordinal}))))fail('original compiler provenance correspondence');
 shape(plan.limits,['maxItems','maxManifestBytes']);if(!Number.isSafeInteger(plan.limits.maxItems)||plan.limits.maxItems<1||plan.limits.maxItems>10000||!Number.isSafeInteger(plan.limits.maxManifestBytes)||plan.limits.maxManifestBytes<1||plan.limits.maxManifestBytes>16777216)fail('native preparation bounds');
 shape(plan.inputs,['assignments','entityParameter']);shape(plan.selection,['artifact','dependencies','profile']);
 const doc=closure.documents.find((d:any)=>d.document.id===model.id);if(!doc||doc.revision!==plan.model.revision||!same(doc.document,model))fail('unchanged original model closure');
 const target={documentId:model.id,moduleId:plan.target.module,elementId:plan.target.element},entity=ontology.entities.find((e:any)=>id(e.type)===id(target));
 if(!entity||entity.keyId!==plan.target.key||!same(mapping.type,ontology.subject))fail('target/Subject source correspondence');
 if(mapping.keyId!==ontology.entities.find((e:any)=>same(e.type,ontology.subject))?.keyId)fail('original ontology Subject Key designation');
 if(!ontology.entities.every((e:any)=>e.fields.every((f:any)=>f.protection==='unprotected')))fail('/ontology: protected domains not qualified');
 shape(owner,['version','id','revision','storage','disclosure']);shape(owner.disclosure,['readAction']);
 shape(profile,['version','id','revision','owner','types','associations']);shape(profile.owner,['id','revision']);
 for(const x of [owner.id,owner.revision,profile.id,profile.revision])if(typeof x!=='string'||!x||x.length>4096)fail('original owner/profile identity');
 if(!Array.isArray(profile.types)||!Array.isArray(profile.associations))fail('original owner profile lists');
 if(owner.version!=='umf.security.logical-owner/0.1'||profile.version!=='umf.security.catalog-write/0.1'||!same(profile.owner,{id:owner.id,revision:owner.revision})||profile.associations.length)fail('original logical/write owner');
 const storage=ontology.entities.flatMap((e:any)=>e.fields.map((f:any)=>canonicalSchemaJson({type:e.type,field:f.ref,storageEffect:'canonical'}))).sort();
 if(!Array.isArray(owner.storage)||owner.storage.length>4096||!same(owner.storage.map(canonicalSchemaJson).sort(),storage))fail('complete bounded canonical owner storage');
 if(profile.types.length!==1)fail('one exact target write profile');const p=profile.types[0];shape(p,['type','createAction','updateAction','deleteAction','fieldActions','policyAction','policyFields','ownershipAction','ownershipFields','readProtection']);
 shape(p.readProtection,['version','readAction','blindWriteActions']);if(id(p.type)!==id(target)||p.readProtection.version!=='umf.security.write-read/0.1.0'||p.readProtection.readAction!==owner.disclosure.readAction||p.readProtection.blindWriteActions.length||p.policyFields.length||p.ownershipFields.length)fail('explicit original read; blind/policy/ownership not qualified');
 if(!Array.isArray(p.policyFields)||!Array.isArray(p.ownershipFields)||!Array.isArray(p.readProtection.blindWriteActions))fail('original policy/ownership/blind lists');
 const purposes=new Map<string,string[]>(ontology.actionPurposes.map((x:any)=>[x.action,x.purposes]));
 const action=(a:any,purpose:string)=>{if(typeof a!=='string'||!purposes.get(a)?.includes(purpose))fail('explicit source action purpose');return a;};
 const readAction=action(p.readProtection.readAction,'read');for(const a of [p.createAction,p.updateAction,p.deleteAction,p.policyAction,p.ownershipAction])action(a,'field');
 if(new Set([readAction,p.createAction,p.updateAction,p.deleteAction,p.policyAction,p.ownershipAction]).size!==6)fail('distinct owner actions');
 if(!Array.isArray(p.fieldActions)||p.fieldActions.length>4096)fail('bounded original Field designations');
 const fieldActions=new Map<string,string>();for(const b of p.fieldActions){shape(b,['field','action']);const key=id(b.field);if(fieldActions.has(key)||!entity.fields.some((f:any)=>id(f.ref)===key)||[readAction,p.createAction,p.updateAction,p.deleteAction,p.policyAction,p.ownershipAction].includes(b.action))fail('exact distinct Field designation');fieldActions.set(key,action(b.action,'field'));}
 if(fieldActions.size!==entity.fields.length)fail('complete Field action designation');
 if(new Set(fieldActions.values()).size>64)fail('original distinct Field action bound');
 shape(invocation,['registrationRequest','loweringRequest','response']);const registration=readJsonValue(invocation.registrationRequest,'json') as any,lowerRequest=readJsonValue(invocation.loweringRequest,'json') as any,lower=readJsonValue(invocation.response,'json') as any;
 shape(registration,['model','modelPin','binding','evidence']);shape(lowerRequest,['selection','model','binding','maxItems']);shape(lower,['status','sql','parameters','columns','preflight','ordering','bounds','obligations']);
 if(!same(lower.obligations,originalLoweringObligations))fail('unknown original native lowering obligation');
 if(!same(registration.model,request.model)||!same(registration.modelPin,request.modelPin)||!same(registration.binding,packet.binding)||!same(lowerRequest.model,request.model)||!same(lowerRequest.binding,packet.binding)||!same(lowerRequest.selection,plan.selection.artifact)||lowerRequest.maxItems!==plan.limits.maxItems||lower.status!=='lowered'||lower.bounds.maxItems!==plan.limits.maxItems||lower.bounds.fetchLimit!==plan.limits.maxItems+1)fail('original registration/lowering/model/binding/bounds correspondence');
 if(binding.releaseId!=='truss-catalog-runtime/0.65-candidate'||binding.interfaceVersion!=='truss-runtime-binding/0.4'||binding.documents.length!==1||binding.documents[0].sha256!==request.model.sha256||binding.documents[0].revision!==plan.model.revision)fail('original current native binding');
 if(binding.schema!=='truss'||binding.documents[0].documentId!==model.id||binding.records.length!==1)fail('one exact installed native record');
 const native=binding.records[0],identity=(element:string,module:string)=>({documentId:model.id,revision:plan.model.revision,module,element}),nativeFields=new Map<string,string>();
 const nativeId=(v:any)=>typeof v==='string'&&/^[1-9][0-9]{0,9}$/.test(v)&&Number(v)<=2147483647;
 if(!same(native.identity,identity(plan.target.element,plan.target.module))||!nativeId(native.typeId))fail('native Record identity');
 for(const f of native.fields){if(!nativeId(f.propertyId)||!same(f.identity,identity(f.identity.element,f.identity.module)))fail('native Field source identity');const r={documentId:model.id,moduleId:f.identity.module,elementId:f.identity.element},key=id(r);if(nativeFields.has(key)||!entity.fields.some((x:any)=>id(x.ref)===key))fail('native Field correspondence');nativeFields.set(key,f.propertyId);}
 if(nativeFields.size!==entity.fields.length||new Set(nativeFields.values()).size!==nativeFields.size)fail('complete unique native Field bindings');
 const selection=read(plan.selection.artifact);shape(selection,['protocol','record','key','predicate']);if(selection.protocol!=='weft.update-selection/1'||!same(selection.record,{module:plan.target.module,element:plan.target.element})||!same(selection.key,plan.target))fail('original selected target/key');
 const needed=new Map<string,any>();const fieldRef=(r:any)=>{shape(r,['module','element']);if(typeof r.module!=='string'||!r.module||typeof r.element!=='string'||!r.element)fail('exact original Field reference');return {documentId:model.id,moduleId:r.module,elementId:r.element};};
 const predicates:any[]=[],parameters:any[]=[];const walk=(n:any)=>{if(n.compare){shape(n,['compare']);shape(n.compare,['field','op','value']);if(n.compare.op!=='eq'||Object.keys(n.compare.value).join(',')!=='string')fail('native predicate subset');nativeString(n.compare.value.string);const r=fieldRef(n.compare.field);needed.set(id(r),r);predicates.push(r);parameters.push({name:'p'+(parameters.length+1),field:n.compare.field,value:n.compare.value});}else if(n.and){shape(n,['and']);if(!Array.isArray(n.and)||!n.and.length)fail('nonempty conjunction');n.and.forEach(walk);}else fail('native predicate subset');};walk(selection.predicate);
 const record=model.modules.find((m:any)=>m.id===plan.target.module)?.elements.find((e:any)=>e.id===plan.target.element),key=record?.keys?.find((k:any)=>k.id===plan.target.key);if(!key)fail('original target Key');key.fields.forEach((r:any)=>needed.set(id(fieldRef(r)),fieldRef(r)));
 const nativeKey=native.keys.filter((k:any)=>k.keyId===plan.target.key);if(nativeKey.length!==1||!same(nativeKey[0].propertyIds,key.fields.map((r:any)=>nativeFields.get(id(fieldRef(r))))))fail('original native ordered Key binding');
 const columns=[{name:'identity',kind:'identity',field:null},{name:'version',kind:'version',field:null},...key.fields.map((field:any,i:number)=>({name:'key'+i,kind:'key',field}))];
 if(!same(lower.parameters,parameters)||!same(lower.columns,columns)||!same(lower.ordering,{kind:'native-integer-identity',direction:'asc'})||!same(lower.bounds,{maxItems:plan.limits.maxItems,fetchLimit:plan.limits.maxItems+1})||!Array.isArray(lower.preflight)||lower.preflight.length!==needed.size+3)fail('native typed parameter/result/preflight descriptors');
 for(const check of [{sql:lower.sql,parameters:lower.parameters},...lower.preflight]){shape(check,['sql','parameters']);if(typeof check.sql!=='string'||!check.sql||check.sql.length>1048576||check.sql.includes('\0')||!Array.isArray(check.parameters))fail('native compiler statement bounds');}
 if(lower.preflight.some((c:any)=>c.parameters.length))fail('native preflight parameter subset');
 if(!same([...new Set(predicates.map(id))].sort(),plan.selection.dependencies.map((r:any)=>id(fieldRef(r))).sort()))fail('exact compiler selection dependencies');
 for(const field of predicates){const declaration=entity.fields.find((f:any)=>id(f.ref)===id(field));if(!declaration||(declaration.queryUse?.predicate??'disclosed')!=='disclosed')fail('selected predicate mode is prohibited or requires separately designated original action');}
 const assignments=plan.inputs.assignments;if(!Array.isArray(assignments)||!assignments.length)fail('actual assignments');const writeRequirements:any[]=[];
 for(const a of assignments){shape(a,['field','input','value']);if(!same(Object.keys(a.value),['string']))fail('native assigned value subset');nativeString(a.value.string);const r=fieldRef(a.field),grant=fieldActions.get(id(r));if(!grant||key.fields.some((k:any)=>id(fieldRef(k))===id(r)))fail('assigned non-Key owner Field');needed.set(id(r),r);writeRequirements.push({field:r,objectAction:p.updateAction,fieldAction:grant,originalReadAction:readAction,states:['before','after']});}
 if(new Set(writeRequirements.map(x=>id(x.field))).size!==writeRequirements.length)fail('duplicate assigned Field');
 for(const r of needed.values())if(!entity.fields.some((f:any)=>id(f.ref)===id(r)))fail('selected original Field');
 for(const r of needed.values()){const f=model.modules.find((m:any)=>m.id===r.moduleId)?.elements.find((e:any)=>e.id===r.elementId);if(f?.scalarType!=='string'||f.nullability!=='required'||f.cardinality!=='one'||Object.keys(f.facets??{}).length||Object.hasOwn(f,'allowedValues')||f.references?.length||Object.keys(f.extensions??{}).length)fail('native plain required String Field subset');}
 const requiredActions=new Set([readAction,p.updateAction,...writeRequirements.map(x=>x.fieldAction)]);
 for(const [i,r] of policy.rules.entries()){if(r.effect!=='permit'||!same(r.condition,{op:'literal',value:true})||r.target.length!==1||!same(r.target[0],target)||(r.disclosure??[]).some((d:any)=>d.disposition.kind!=='original'))fail(`/policy/rules/${i}: native literal permit subset`);}
 for(const a of requiredActions)if(!policy.rules.some((r:any)=>r.actions.includes(a)))fail('missing separate original read/update/Field permit '+a);
 for(const r of needed.values())if(!policy.rules.some((rule:any)=>rule.actions.includes(readAction)&&(rule.disclosure??[]).some((d:any)=>id(d.field)===id(r)&&d.disposition.kind==='original')))fail('explicit original Field disclosure');
 const declaration=model.modules.find((m:any)=>m.id===plan.action.identity.module)?.extensions?.['umf.actions']?.actions?.find((a:any)=>a.id===plan.action.identity.action),configured=configuration.actions?.find((a:any)=>same(a.pin,plan.action));
 if(!configured||!same(configured.snapshot,request.model)||declaration?.authorization?.kind!=='roles'||!same(declaration.authorization.profile,{id:'umf.actions.roles',version:'1'})||declaration.attribution?.subject!=='person-required')fail('original action declaration/roles');
 if(declaration.preconditions.length||declaration.postconditions.length||declaration.reads.length||declaration.outputs.length||declaration.failures.length||declaration.binding.kind!=='recipe'||!same(declaration.binding.profile,{id:'graph-write',version:'1'}))fail('native action obligation subset');
 const entityParameter=declaration.parameters.find((p:any)=>p.id===plan.inputs.entityParameter);
 if(entityParameter?.kind!=='entity'||!same(entityParameter.target,plan.target))fail('original entity parameter');
 if(declaration.parameters.length!==assignments.length+1||declaration.parameters.some((p:any)=>p.required!==true))fail('complete required parameter binding');
 if(declaration.writes.length!==1)fail('one exact set write frame');const frame=declaration.writes[0];
 if(!same(frame.record,{module:plan.target.module,element:plan.target.element})||frame.maxEntities!==1||frame.create!==false||frame.delete!==false||frame.relationships.length||!same(frame.fields.map(canonicalSchemaJson).sort(),assignments.map((a:any)=>canonicalSchemaJson(a.field)).sort())||!same(frame.selector,{language:'umf.actions.keys',version:'1',expression:JSON.stringify({entity:plan.inputs.entityParameter}),references:[{parameter:plan.inputs.entityParameter}]}))fail('original bounded write frame correspondence');
 for(const a of assignments){const parameter=declaration.parameters.find((p:any)=>p.id===a.input);if(parameter?.kind!=='value'||!same(parameter.field,a.field)||!declaration.binding.effects.some((e:any)=>e.kind==='set'&&e.entity.parameter===plan.inputs.entityParameter&&e.values.some((v:any)=>same(v.field,a.field)&&same(v.value,{parameter:a.input}))))fail('original Field/value recipe binding');}
 if(declaration.binding.effects.some((e:any)=>e.kind!=='set'||e.entity.parameter!==plan.inputs.entityParameter||e.values.some((v:any)=>!assignments.some((a:any)=>same(a.field,v.field)&&same(v.value,{parameter:a.input})))))fail('unmapped recipe obligation');
 // Descriptor-only admission: actual principal value is checked only at derivation.
 subjectDescriptor(mapping,closure);
 return freeze({protocol:'truss.preparation-source-obligations/0.1-candidate',complete:false,authority:false,nativeProfile:'truss.preparation.literal-rbac/0.1-candidate',compilerProfile:PREPARATION_COMPILER_PROFILE,original:packet,extensionClosure:extensions,target,subjectMapping:mapping,nativeFields:[...needed.values()].map(field=>({field,typeId:native.typeId,propertyId:nativeFields.get(id(field))})),readRequirements:[...needed.values()].map(field=>({field,action:readAction,disposition:'original'})),writeRequirements,actionRoles:{pin:plan.action,profile:declaration.authorization.profile,roles:declaration.authorization.roles,personRequired:true},nativeObligations:[{kind:'literal-policy',status:'lowered-source',rules:policy.rules},{kind:'native-identity-and-current-authority',status:'required',checks:['all-exact-enrolled-compiler-and-authored-owner-source-bytes-and-provenance','issued-store-program-anchor-nonce','D-fullxid-one-shot-committed-claim','current-native-human-and-exact-action-role','current-owner-per-action-and-Field-cuts','all-applicable-native-home-DDL-legacy-facade-and-serving-copy-inventory','complete-authorized-population-preflights-and-overflow-refusal','protected-selector-finalizer-and-effect-custody']} ]});
}
if(import.meta.main){
 const args=Bun.argv.slice(2);if(args.length!==1)throw Error('Expected one original source-packet JSON file');
 const file=Bun.file(args[0]!);if(file.size>64*1024*1024)throw Error('Source-packet transport bound');
 const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(await file.arrayBuffer());
 const input=readJsonValue(text,'json') as unknown as PreparationSourceInputs;
 console.log(JSON.stringify(compilePreparationSourceObligations(input)));
}
