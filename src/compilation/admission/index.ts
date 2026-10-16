import {copyJson,readDocument,validateDocument,inspectCoreRelationships,inspectCoreKeys,inspectCoreFacets,inspectCoreSchemaProperties,inspectCoreElementKind,validateCoreFieldValue,inspectActions,registerActions,Registry,UmfError,type InspectedAction,type Document} from '../../index';
import {inspectSelectedSearch} from './search';
import {inspectAccessViews,type SuppliedBinding} from './access/index';
import type {AccessRequest,AccessProfile,AccessDiagnostic,Disposition,Obligation,ResolvedAccess,ResolvedActionParameter,Ref} from '../ir/index';
export interface Admission {request:AccessRequest;profile:AccessProfile;ir:ResolvedAccess;diagnostics:AccessDiagnostic[];dispositions:Disposition[];obligations:Obligation[]}
export class AccessInputError extends Error {constructor(readonly code:string,readonly pointer:string){super('Typed access admission refused: '+code);this.name='AccessInputError';}}
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const ref=(v:unknown):v is Ref=>object(v)&&Object.keys(v).length===2&&typeof v.module==='string'&&!!v.module&&typeof v.element==='string'&&!!v.element;
const keys=(v:unknown,required:readonly string[],optional:readonly string[]=[])=>object(v)&&required.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>required.includes(k)||optional.includes(k));
const esc=(s:string)=>s.replace(/~/g,'~0').replace(/\//g,'~1');
const identity=(r:Ref)=>JSON.stringify([r.module,r.element]);
export const ASSERTION_KINDS=['kind','nullability','Key','facets','defaults','relationships','actions','umf.access'] as const;
export function admitAccessRequest(input:unknown,profileInput:unknown):Admission {
 let request:AccessRequest,profile:AccessProfile;
 try{request=copyJson(input) as unknown as AccessRequest;profile=copyJson(profileInput) as unknown as AccessProfile;}catch{throw new AccessInputError('INPUT','');}
 const required=['contract','sources','logical','bindings','records','actions','projections','package','names','mode','profileId','profileVersion','coreVersion'];
 if(!keys(request,required)||request.contract!=='umf-access-generate/0.1'||request.coreVersion!=='0.8.0'||!['strict','report'].includes(request.mode)||typeof request.package!=='string'||!/^[a-z][a-z0-9_]*$/.test(request.package)||!['logical','profileId','profileVersion'].every(k=>typeof (request as unknown as Record<string,unknown>)[k]==='string')||!['sources','bindings','records','actions','projections','names'].every(k=>Array.isArray((request as unknown as Record<string,unknown>)[k])))throw new AccessInputError('INPUT','');
 if(!request.sources.length||!request.records.length||request.sources.some(s=>!keys(s,['id','format','text'])||typeof s.id!=='string'||!s.id||!['json','yaml'].includes(s.format)||typeof s.text!=='string')||new Set(request.sources.map(s=>s.id)).size!==request.sources.length||request.records.some(r=>!ref(r))||new Set(request.records.map(identity)).size!==request.records.length||request.bindings.some(b=>typeof b!=='string')||new Set(request.bindings).size!==request.bindings.length)throw new AccessInputError('INPUT','');
 if(request.actions.some(a=>!keys(a,['module','action'])||typeof a.module!=='string'||typeof a.action!=='string')||new Set(request.actions.map(a=>JSON.stringify(a))).size!==request.actions.length||request.projections.some(p=>!keys(p,['name','record','fields'])||typeof p.name!=='string'||!ref(p.record)||!Array.isArray(p.fields)||p.fields.some(f=>!ref(f)))||request.names.some(n=>!keys(n,['sourceId','pointer','python'])||typeof n.sourceId!=='string'||typeof n.pointer!=='string'||typeof n.python!=='string'))throw new AccessInputError('INPUT','');
 const diagnostics:AccessDiagnostic[]=[],dispositions:Disposition[]=[],obligations:Obligation[]=[];
 const add=(code:string,pointer:string,sourceId=request.logical)=>diagnostics.push({code,sourceId,pointer,message:'Typed access declaration refused: '+code});
 const empty:ResolvedAccess={documentId:'',sourceId:request.logical,records:[]};
 const finish=(ir=empty)=>({request,profile,ir,diagnostics,dispositions,obligations});
 const profileKeys=['id','version','compilerVersion','coreVersions','vocabularies','python','dependencies','checkers','reservedNames','importedNames','assertionKinds','subset','codeSha256'];
 if(!keys(profile,profileKeys)||profile.id!==request.profileId||profile.version!==request.profileVersion||typeof profile.codeSha256!=='string'||!/^[0-9a-f]{64}$/.test(profile.codeSha256)||!Array.isArray(profile.coreVersions)||!profile.coreVersions.includes('0.8.0')||!Array.isArray(profile.dependencies)||!Array.isArray(profile.checkers)||!Array.isArray(profile.assertionKinds)||profile.assertionKinds.some(k=>!(ASSERTION_KINDS as readonly string[]).includes(k))||!Array.isArray(profile.reservedNames)||!Array.isArray(profile.importedNames)){add('PROFILE','/profile');return finish();}
 if(!['id','version','compilerVersion','subset'].every(k=>typeof (profile as unknown as Record<string,unknown>)[k]==='string')||!keys(profile.python,['version'])||typeof profile.python.version!=='string'||!Array.isArray(profile.vocabularies)||profile.vocabularies.some(v=>!keys(v,['id','version'])||typeof v.id!=='string'||typeof v.version!=='string')||profile.dependencies.some(d=>!keys(d,['distribution','version'])||typeof d.distribution!=='string'||!d.distribution||typeof d.version!=='string'||!/^\d+(?:\.\d+)*(?:(?:a|b|rc|\.dev|\.post)\d+)?(?:\+[A-Za-z0-9.]+)?$/.test(d.version))||new Set(profile.dependencies.map(d=>d.distribution.replace(/[-_.]+/g,'-').toLowerCase())).size!==profile.dependencies.length||profile.checkers.some(c=>!keys(c,['name','version','configuration'])||typeof c.name!=='string'||typeof c.version!=='string'||!object(c.configuration))||[...profile.reservedNames,...profile.importedNames,...profile.coreVersions].some(x=>typeof x!=='string')){add('PROFILE','/profile');return finish();}
 if(!profile.vocabularies.some(v=>v.id==='umf.access'&&v.version==='0.1.0')||request.actions.length>0&&!profile.vocabularies.some(v=>v.id==='umf.actions'&&v.version==='0.1.0')){add('PROFILE','/profile/vocabularies');return finish();}
 if(!profile.dependencies.some(d=>d.distribution==='pydantic'&&/^2\.(?:1[4-9]|[2-9]\d|\d{3,})\.[0-9]+$/.test(d.version))||!profile.dependencies.some(d=>['umf_access','umf-access'].includes(d.distribution)&&typeof d.version==='string'&&!!d.version)||!profile.checkers.some(c=>c.name==='mypy'&&c.configuration?.check_untyped_defs===true)||!profile.checkers.some(c=>c.name==='pyright'&&typeof c.configuration?.typeCheckingMode==='string'&&typeof c.configuration?.environment==='string')){add('PROFILE','/profile');return finish();}
 if(request.sources.length>32||request.records.length>10000||request.actions.length>1000){add('LIMIT','');return finish();}
 const documents=new Map<string,Document>();
 for(const [i,source] of request.sources.entries()){
  try{documents.set(source.id,readDocument(source.text,source.format));}catch(error){if(error instanceof UmfError&&error.code==='LIMIT'){add('LIMIT',`/sources/${i}/text`,source.id);return finish();}throw new AccessInputError('INPUT',`/sources/${i}/text`);}
 }
 const document=documents.get(request.logical);
 if(!document||document.umf!=='0.8.0'){throw new AccessInputError('INPUT','/logical');}
 const bindings:SuppliedBinding[]=[];
 for(const id of request.bindings){const d=documents.get(id);if(!d){add('REFERENCE','/bindings');continue;}bindings.push({sourceId:id,document:d});}
 if(diagnostics.length)return finish();
 const inspection=inspectAccessViews(document,request.records,bindings,request.logical);diagnostics.push(...inspection.diagnostics);
 const ir:ResolvedAccess={documentId:document.id,sourceId:request.logical,records:inspection.records,relations:[],actions:[]};
 ir.search=inspectSelectedSearch(document,ir.records,add);
 const dependencyKeys=new Map<string,string>();
 const selectedIds=new Set(request.records.map(identity));
 for(const [mi,authoredModule] of document.modules.entries()){
  const relationships=inspectCoreRelationships(document,{module:authoredModule.id});
  if(relationships.meaning.state!=='known'&&relationships.meaning.state!=='partial')continue;
  for(const [ri,relation] of relationships.meaning.relationships.entries()){
   const pointer=`/modules/${mi}/relationships/${ri}`;
   const owners=relation.source.filter(r=>selectedIds.has(identity(r)));
   if(!owners.length)continue;
   if(relationships.meaning.uninterpretedPaths.some(p=>p===pointer||p.startsWith(pointer+'/'))){add('UNKNOWN_RELEVANT',pointer);continue;}
   if(relation.source.length!==1||relation.target.length!==1||!relation.directed){add('LOSS',pointer);continue;}
   const target=relation.target[0]!;
   ir.relations!.push({owner:{module:owners[0]!.module,element:owners[0]!.element},target:{module:target.module,element:target.element},key:target.key,python:'',pointer,module:authoredModule.id,id:relation.id,logicalName:relation.name,toOne:relation.targetMultiplicity.max===1,optional:relation.targetMultiplicity.min===0});
   if(!selectedIds.has(identity(target))){const old=dependencyKeys.get(identity(target));if(old&&old!==target.key)add('REFERENCE',pointer+'/target');dependencyKeys.set(identity(target),target.key);}
   dispositions.push({id:'d'+dispositions.length,sourceId:request.logical,pointer,assertion:'relationships',relevance:'selected',fidelity:'exact',checks:['informational'],reason:'inspectCoreRelationships result2.0.0; native multiplicity/lifecycle enforcement remains engine-owned',obligationIds:[]});
  }
 }
 const selectedActionEntries:InspectedAction[]=[];
 if(request.actions.length){
  try{
   const inspected=inspectActions(document,registerActions(new Registry()));
   if(!inspected.validation.valid)add('REFERENCE','/actions');
   for(const selectedAction of request.actions){
    const entry=inspected.actions.find(a=>a.module===selectedAction.module&&a.action.id===selectedAction.action);
    if(!entry){add('REFERENCE','/actions');continue;}
    selectedActionEntries.push(entry);
    for(const obligation of entry.obligations)if(obligation.kind==='unknown')add('UNKNOWN_RELEVANT',obligation.path);
    for(const p of [...entry.action.parameters,...entry.action.outputs])if(p.kind==='entity'&&!selectedIds.has(identity(p.target))){
     const old=dependencyKeys.get(identity(p.target));if(old&&old!==p.target.key)add('REFERENCE',entry.path);dependencyKeys.set(identity(p.target),p.target.key);
    }
   }
  }catch{add('REFERENCE','/actions');}
 }
 for(const [encoded,keyId] of dependencyKeys){
  const [moduleId,elementId]=JSON.parse(encoded) as [string,string],reference={module:moduleId,element:elementId};
  const mi=document.modules.findIndex(m=>m.id===moduleId),ei=document.modules[mi]?.elements.findIndex(e=>e.id===elementId)??-1;
  const meaning=inspectCoreKeys(document,reference).meaning;
  const key=meaning.state==='known'?meaning.keys.find(k=>k.id===keyId):undefined;
  if(!key){add('REFERENCE',`/modules/${mi}/elements/${ei}/keys`);continue;}
  const dependency={ref:reference,pointer:`/modules/${mi}/elements/${ei}`,python:'',namespace:document.modules[mi]!.namespace,logicalName:typeof document.modules[mi]!.elements[ei]!.name==='string'?document.modules[mi]!.elements[ei]!.name:null,fields:[] as ResolvedAccess['records'][number]['fields'],keys:[{id:key.id,fields:key.fields.map(r=>({...r}))}],selected:false};
  for(const fieldRef of key.fields){
   const fmi=document.modules.findIndex(m=>m.id===fieldRef.module),fei=document.modules[fmi]?.elements.findIndex(e=>e.id===fieldRef.element)??-1,field=document.modules[fmi]?.elements[fei];
   if(!field){add('REFERENCE',dependency.pointer);continue;}
   if(['date','timestamp'].includes(field.scalarType??'')){add('ACCESS',dependency.pointer);continue;}
   const facets=inspectCoreFacets(document,fieldRef).meaning;
   if(facets.state==='partial')add('UNKNOWN_RELEVANT',facets.uninterpretedPaths[0]??dependency.pointer);
   dependency.fields.push({ref:{module:fieldRef.module,element:fieldRef.element},pointer:`/modules/${fmi}/elements/${fei}`,python:'',logicalName:typeof field.name==='string'?field.name:null,scalarType:field.scalarType??null,cardinality:'one',row:{missing:false,null:false},create:{missing:false,null:false},mutable:false,generated:false,facets:facets.state==='known'?{...facets.interpreted}:{},properties:inspectCoreSchemaProperties(document,{scope:'element',module:fieldRef.module,element:fieldRef.element}).properties});
  }
  ir.records.push(dependency);
 }
 // Profiles cannot invent or silently skip an assertion kind.
 for(const assertion of ASSERTION_KINDS)if(!profile.assertionKinds.includes(assertion)&&inspection.records.some(r=>assertion==='kind'||assertion==='nullability'||assertion==='umf.access'||assertion==='Key'&&r.keys.length||assertion==='facets'&&r.fields.some(f=>Object.keys(f.facets).length)||assertion==='defaults'&&r.fields.some(f=>Object.hasOwn(f.properties,'default'))))add('UNKNOWN_RELEVANT','/profile/assertionKinds');
 const selectedPaths=new Set<string>();
 for(const record of ir.records){
  if(record.selected)selectedPaths.add(record.pointer);
  else{selectedPaths.add(record.pointer+'/id');selectedPaths.add(record.pointer+'/kind');const mi=document.modules.findIndex(m=>m.id===record.ref.module),node=document.modules[mi]?.elements.find(e=>e.id===record.ref.element);for(const key of record.keys){const index=Array.isArray(node?.keys)?(node.keys as {id:string}[]).findIndex(k=>k.id===key.id):-1;selectedPaths.add(record.pointer+'/keys/'+index);}}
  for(const field of record.fields)selectedPaths.add(field.pointer);
 }
 // Missing/invalid access views must not erase the original selected census.
 const visitMembers=(reference:Ref,visited=new Set<string>())=>{const id=identity(reference);if(visited.has(id))return;visited.add(id);const mi=document.modules.findIndex(m=>m.id===reference.module),ei=document.modules[mi]?.elements.findIndex(e=>e.id===reference.element)??-1,node=document.modules[mi]?.elements[ei];if(!node)return;selectedPaths.add(`/modules/${mi}/elements/${ei}`);for(const member of Array.isArray(node.members)?node.members as Ref[]:[])if(ref(member))visitMembers(member,visited);if(ref(node.itemType))visitMembers(node.itemType,visited);};
 for(const record of request.records)visitMembers(record);
 for(const record of ir.records.filter(r=>!r.selected))visitMembers(record.ref);
 for(const vocabulary of ['umf.access',...(request.actions.length?['umf.actions']:[])])for(const member of Object.keys(document.vocabularies[vocabulary]??{}))if(member!=='version')add('UNKNOWN_RELEVANT','/vocabularies/'+esc(vocabulary)+'/'+esc(member));
 const relevant=(p:string)=>[...selectedPaths].some(base=>p===base||p.startsWith(base+'/'));
 // Public validation owns the unknown-core vocabulary. Access is interpreted by
 // the contextual validator; its absent registry warning is not missing meaning.
 for(const d of validateDocument(document).diagnostics){
  if(d.severity==='warning'&&d.code!=='UNKNOWN_EXTENSION'&&relevant(d.path))add('UNKNOWN_RELEVANT',d.path);
 }
 const selectedKeys=new Set(request.records.map(identity));

 for(const k of Object.keys(document.extensions??{}))add('UNKNOWN_RELEVANT','/extensions/'+esc(k));
 for(const n of request.names)if(n.sourceId!==request.logical)add('NAME','/names');
 for(const [mi,authoredModule] of document.modules.entries()){
  const base=`/modules/${mi}`;
  if(request.records.some(r=>r.module===authoredModule.id)){
   for(const k of Object.keys(document))if(!['umf','id','vocabularies','modules','extensions','title','aliases'].includes(k))add('UNKNOWN_RELEVANT','/'+esc(k));
   for(const k of Object.keys(authoredModule))if(!['id','namespace','elements','extensions','relationships','title','aliases'].includes(k))add('UNKNOWN_RELEVANT',base+'/'+esc(k));
   for(const k of Object.keys(authoredModule.extensions??{}))if(k!=='umf.access'&&(k!=='umf.actions'||document.vocabularies[k]?.version!=='0.1.0'||!object(authoredModule.extensions?.[k])||!Array.isArray((authoredModule.extensions?.[k] as Record<string,unknown>).actions)||Object.keys(authoredModule.extensions?.[k] as object).some(member=>member!=='actions')))add('UNKNOWN_RELEVANT',base+'/extensions/'+esc(k));
  }
  const access=authoredModule.extensions?.['umf.access'];
  if(object(access)){
   for(const [index,entry] of (Array.isArray(access.views)?access.views:[]).entries())if(object(entry)&&ref(entry.record)&&selectedKeys.has(identity(entry.record))){
    const walkAccess=(value:unknown,pointer:string)=>{if(object(value)||Array.isArray(value)){for(const [k,child] of Object.entries(value))walkAccess(child,pointer+'/'+esc(k));if(Object.keys(value).length)return;}dispositions.push({id:'d'+dispositions.length,sourceId:request.logical,pointer,assertion:'umf.access',relevance:'selected',fidelity:'exact',checks:['client'],reason:'Authored view checked against core presence and retained',obligationIds:[]});};
    walkAccess(entry,base+'/extensions/umf.access/views/'+index);
   }
   if(Array.isArray(access.columns))for(const [ci,entry] of access.columns.entries())if(object(entry)&&Array.isArray(entry.columns)&&entry.columns.some(c=>object(c)&&ref(c.field)&&ir.records.some(r=>r.selected&&r.fields.some(f=>identity(f.ref)===identity(c.field as unknown as Ref))))){
    const oid='o'+obligations.length,ids:string[]=[];
    const walkColumns=(value:unknown,pointer:string)=>{if(object(value)||Array.isArray(value)){for(const [key,child] of Object.entries(value))walkColumns(child,pointer+'/'+esc(key));if(Object.keys(value).length)return;}const id='d'+dispositions.length;ids.push(id);dispositions.push({id,sourceId:request.logical,pointer,assertion:'umf.access',relevance:'selected',fidelity:'exact',checks:['informational'],reason:'Authored ColumnSet fact retained and declaration-checked; no native table observation or enforcement implied',obligationIds:[oid]});};
    walkColumns(entry,base+'/extensions/umf.access/columns/'+ci);obligations.push({id:oid,owner:'qualifier',description:'Pinned native schema, generation and transport require target verify/conformance evidence',dispositionIds:ids});
   }
   for(const search of ir.search??[])if(search.pointer.startsWith(base+'/')){selectedPaths.add(search.pointer);dispositions.push({id:'d'+dispositions.length,sourceId:request.logical,pointer:search.pointer,assertion:'umf.access',relevance:'selected',fidelity:'exact',checks:['informational'],reason:'Complete authored search declaration and bindings retained; native mechanisms and filtering require catalog qualification',obligationIds:[]});}
  }
  for(const [ei,element] of authoredModule.elements.entries()){
   const path=base+`/elements/${ei}`,isRelevant=relevant(path);
   if(isRelevant){
    for(const k of Object.keys(element.extensions))add('UNKNOWN_RELEVANT',path+'/extensions/'+esc(k));
    if(Array.isArray(element.references)&&element.references.length)add('LOSS',path+'/references');
   }
   const walk=(value:unknown,pointer:string)=>{
    if(object(value)||Array.isArray(value)){for(const [key,child] of Object.entries(value))walk(child,pointer+'/'+esc(key));if(Object.keys(value).length)return;}
    dispositions.push({id:'d'+dispositions.length,sourceId:request.logical,pointer,assertion:pointer.slice(path.length+1).split('/')[0]||'element',relevance:isRelevant?(selectedKeys.has(identity({module:authoredModule.id,element:element.id}))?'selected':'dependency'):'unselected',fidelity:isRelevant?'exact':'unknown',checks:isRelevant&&ir.records.some(r=>r.selected&&r.pointer===path||r.fields.some(f=>f.pointer===path))&&['kind','nullability','cardinality','facets','allowedValues','members','keys'].includes(pointer.slice(path.length+1).split('/')[0]!)?['client']:['informational'],reason:isRelevant?'Public core admission and contextual inspectors resolve this authored assertion; metadata retention does not imply enforcement':'Unselected content retained in exact source archive',obligationIds:[]});
   };
   walk(element,path);
  }
 }
 for(const record of ir.records){
  const keyDispositions=dispositions.filter(d=>d.pointer.startsWith(record.pointer+'/keys/'));
  if(keyDispositions.length){const id='o'+obligations.length;for(const d of keyDispositions){d.checks=['informational'];d.reason='inspectCoreKeys result3.0.0 retains ordered identity; Python DTO equality is not UMF equality or store uniqueness';d.obligationIds.push(id);}obligations.push({id,owner:'engine',description:'Store enforces authored Key uniqueness/equality; generated DTO does not establish it',dispositionIds:keyDispositions.map(d=>d.id)});}
 }
 for(const record of ir.records){
  if(record.fields.length>10000){add('LIMIT',record.pointer);continue;}
  if(record.selected&&!record.keys.length){add('LOSS',record.pointer+'/keys');markNotExpressible(record.pointer);}
  const wireIds=record.fields.filter(f=>f.owned!==false).map(f=>f.ref.element);
  if(new Set(wireIds).size!==wireIds.length)add('REFERENCE',record.pointer+'/members');
  const used=new Set<string>();
  record.python=resolveName(record.ref.element,'class',record.pointer);
  for(const field of record.fields){
   field.python=resolveName(field.ref.element,'field',field.pointer);
   if(used.has(field.python)){add('NAME',field.pointer);}used.add(field.python);
   if(field.scalarType==='float'&&!field.vectorComponent||field.scalarType==='time'||field.cardinality==='unspecified'){add('LOSS',field.pointer);markNotExpressible(field.pointer);}
   if(field.item){
    if(record.fields.some(f=>identity(f.ref)===identity(field.item!)&&f.scalarType==='float')&&!field.vectorDimensions)add('LOSS',field.pointer);
    const seen=new Set<string>();let current:typeof field|undefined=field;
    while(current?.item){const id=identity(current.ref);if(seen.has(id)){add('LOSS',field.pointer);markNotExpressible(field.pointer);break;}seen.add(id);current=record.fields.find(f=>identity(f.ref)===identity(current!.item!));}
    if(Array.isArray(field.properties.allowedValues)){add('LOSS',field.pointer+'/allowedValues');markNotExpressible(field.pointer);}
   }
   if(Object.hasOwn(field.properties,'default')){const id='o'+obligations.length,ds=dispositions.filter(d=>d.pointer.startsWith(field.pointer+'/default'));for(const d of ds){d.checks=['engine'];d.obligationIds.push(id);}obligations.push({id,owner:'engine',description:'Engine applies authored default; generated input never executes defaults',dispositionIds:ds.map(d=>d.id)});}
  }
 }
 if(profile.reservedNames.includes(request.package)||profile.importedNames.includes(request.package)||['datetime','decimal','typing','types','pydantic','umf_access'].includes(request.package)||pythonKeywords.has(request.package))add('NAME','/package');
 for(const search of ir.search??[])search.python=resolveName(search.id,'field',search.pointer);
 for(const record of ir.records){const names=(ir.search??[]).filter(s=>identity(s.record)===identity(record.ref)).map(s=>s.python);if(new Set(names).size!==names.length)add('NAME',record.pointer);}
 const classNames=new Set<string>();for(const record of ir.records)for(const suffix of (record.selected?['','Create','Patch','Key','Update','Columns','Query',...((ir.search??[]).some(s=>identity(s.record)===identity(record.ref))?['Search']:[])]:['Key'])){const name=record.python+suffix;if(classNames.has(name))add('NAME',record.pointer);classNames.add(name);}
 for(const record of ir.records)for(const key of record.keys.slice(1)){
  const suffix=key.id.replace(/[^A-Za-z0-9]/g,'_').replace(/([A-Z]+)([A-Z][a-z])/g,'$1_$2').replace(/([a-z0-9])([A-Z])/g,'$1_$2').split('_').map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join('');
  const name=record.python+suffix+'Key';
  if(classNames.has(name)||!/^[A-Za-z][A-Za-z0-9_]*$/.test(name))add('NAME',record.pointer+'/keys');classNames.add(name);
 }

 for(const p of request.projections){if(!selectedKeys.has(identity(p.record))||new Set(p.fields.map(identity)).size!==p.fields.length||new Set(p.fields.map(f=>f.element)).size!==p.fields.length){add('REFERENCE','/projections');continue;}const record=ir.records.find(r=>identity(r.ref)===identity(p.record));const reachable=new Set([identity(p.record)]);for(let depth=0;depth<3;depth++){const prior=new Set(reachable);for(const rel of ir.relations??[])if(rel.toOne&&prior.has(identity(rel.owner)))reachable.add(identity(rel.target));}
 if(p.fields.some(f=>!ir.records.filter(r=>r.selected&&reachable.has(identity(r.ref))).some(r=>r.fields.some(field=>field.owned!==false&&identity(field.ref)===identity(f)))))add('REFERENCE','/projections');const projectionNames:string[]=[];for(const f of p.fields){const own=record?.fields.find(field=>field.owned!==false&&identity(field.ref)===identity(f));const candidates=own?[own]:ir.records.filter(r=>r.selected&&reachable.has(identity(r.ref))).flatMap(r=>r.fields.filter(field=>field.owned!==false&&identity(field.ref)===identity(f)));if(candidates.length!==1)add('REFERENCE','/projections');else projectionNames.push(candidates[0]!.python);}if(!p.fields.length||new Set(projectionNames).size!==projectionNames.length)add('NAME','/projections');const name=resolveName(p.name,'class','/projections/'+request.projections.indexOf(p));if(classNames.has(name)||classNames.has(name+'Projection'))add('NAME','/projections');classNames.add(name);classNames.add(name+'Projection');}
 for(const relation of ir.relations??[]){relation.python=resolveName(relation.id,'field',relation.pointer);const owner=ir.records.find(r=>identity(r.ref)===identity(relation.owner));if(owner?.fields.some(f=>f.owned!==false&&f.python===relation.python)||(ir.relations??[]).some(other=>other!==relation&&identity(other.owner)===identity(relation.owner)&&other.python===relation.python))add('NAME',relation.pointer);}
 for(const n of request.names)if((!selectedPaths.has(n.pointer)&&!ir.relations?.some(r=>r.pointer===n.pointer)&&!request.projections.some((_p,i)=>n.pointer==='/projections/'+i)&&!selectedActionEntries.some(a=>n.pointer===a.path||n.pointer.startsWith(a.path+'/parameters/')||n.pointer.startsWith(a.path+'/outputs/')))||n.sourceId!==request.logical)add('NAME','/names');
 for(const entry of selectedActionEntries){
  const python=resolveName(entry.action.id,'class',entry.path);
  if(['Actions','ReplayingActions','ActionSource','KeyTypeRef','RecordTypeRef','ActionEndpoint','ReplayingActionEndpoint','ActionExecutor','ReplayingActionExecutor'].includes(python))add('NAME',entry.path);
  for(const suffix of ['','Input','Output','Rejected','Committed']){const name=python+suffix;if(classNames.has(name))add('NAME',entry.path);classNames.add(name);}
  const parameters=(group:'parameters'|'outputs')=>{const usedNames=new Set<string>();return entry.action[group].flatMap<ResolvedActionParameter>((parameter,i)=>{
   const pointer=entry.path+'/'+group+'/'+i,python=resolveName(parameter.id,'field',pointer);
   if(usedNames.has(python))add('NAME',pointer);usedNames.add(python);
   if(parameter.kind==='entity'){
    const record=ir.records.find(r=>identity(r.ref)===identity(parameter.target));
    if(!record||!record.keys.some(k=>k.id===parameter.target.key)){add('REFERENCE',pointer);return [];}
    return [{id:parameter.id,python,required:true,pointer,entity:{module:parameter.target.module,element:parameter.target.element},entityKey:parameter.target.key}];
   }
   const field=ir.records.flatMap(r=>r.fields).find(f=>identity(f.ref)===identity(parameter.field));
   if(!field){add('REFERENCE',pointer+'/field');return [];}
   return [{id:parameter.id,python,required:parameter.required,pointer,field:{...field,row:{...field.row,null:validateCoreFieldValue(document,field.ref,null).valid}}}];
  });};
  const createdKeys:(Ref&{key:string})[]=[],changedKeys:(Ref&{key:string})[]=[];
  const addKey=(list:(Ref&{key:string})[],key:Ref&{key:string},pointer:string)=>{if(!ir.records.some(r=>identity(r.ref)===identity(key)&&r.keys.some(k=>k.id===key.key))){add('REFERENCE',pointer);return;}if(!list.some(k=>identity(k)===identity(key)&&k.key===key.key))list.push({...key});};
  const authored=entry.action as unknown as Record<string,unknown>;
  const entityKey=(value:unknown):Ref&{key:string}|null=>{if(!object(value))return null;const parameter=typeof value.parameter==='string'?(authored.parameters as Record<string,unknown>[]).find(p=>p.id===value.parameter):undefined;return parameter?.kind==='entity'?parameter.target as Ref&{key:string}:null;};
  if(entry.action.binding.kind==='recipe'){
   const effects=(authored.binding as {effects:Record<string,unknown>[]}).effects;
   for(const [index,effect] of effects.entries()){
    const pointer=entry.path+'/binding/effects/'+index;
    if(effect.kind==='create'&&ref(effect.record)&&typeof effect.key==='string')addKey(createdKeys,{...effect.record,key:effect.key},pointer);
    if(effect.kind==='set'){const key=entityKey(effect.entity);if(key)addKey(changedKeys,key,pointer);}
    if(effect.kind==='link'||effect.kind==='unlink')for(const endpoint of [effect.source,effect.target]){const key=entityKey(endpoint);if(key)addKey(changedKeys,key,pointer);}
   }
  }else{
   for(const frame of authored.writes as Record<string,unknown>[]){
    if(!ref(frame.record))continue;
    const record=ir.records.find(r=>identity(r.ref)===identity(frame.record as unknown as Ref));
    if(!record){add('REFERENCE',entry.path+'/writes');continue;}
    let selected=record.keys;
    const selector=frame.selector as Record<string,unknown>;
    if(selector.language==='umf.actions.keys'&&selector.version==='1'&&typeof selector.expression==='string'){
     let decoded:unknown;try{decoded=JSON.parse(selector.expression);}catch{}
     if(object(decoded)&&typeof decoded.key==='string')selected=selected.filter(k=>k.id===decoded.key);
     else if(object(decoded)&&typeof decoded.entity==='string'){const parameter=(authored.parameters as Record<string,unknown>[]).find(p=>p.id===decoded.entity);if(parameter?.kind==='entity'&&object(parameter.target)){const target=parameter.target;selected=selected.filter(k=>k.id===target.key);};}
    }
    for(const key of selected){const reference={...record.ref,key:key.id};if(frame.create===true)addKey(createdKeys,reference,entry.path+'/writes');if(Array.isArray(frame.fields)&&frame.fields.length||Array.isArray(frame.relationships)&&frame.relationships.length)addKey(changedKeys,reference,entry.path+'/writes');}
   }
  }
  ir.actions!.push({module:entry.module,id:entry.action.id,python,pointer:entry.path,parameters:parameters('parameters'),outputs:parameters('outputs'),failures:entry.action.failures.map(f=>({code:f.code,retryable:f.retryable})),kind:entry.action.binding.kind,createdKeys,changedKeys});
  for(const obligation of entry.obligations){
   const id='d'+dispositions.length,oid='o'+obligations.length;
   dispositions.push({id,sourceId:request.logical,pointer:obligation.path,assertion:'actions',relevance:'selected',fidelity:'exact',checks:['informational'],reason:'inspectActions declaration result; external execution duties remain undischargeable by generation',obligationIds:[oid]});
   obligations.push({id:oid,owner:'engine',description:'Selected action '+obligation.kind+' remains an executor obligation',dispositionIds:[id]});
   if(obligation.kind==='model'&&!selectedPaths.has(obligation.path)&&!ir.records.some(r=>r.pointer===obligation.path)&&!ir.relations?.some(r=>r.pointer===obligation.path))add('REFERENCE',obligation.path);
  }
 }
 if(dispositions.length>100000||selectedPaths.size>10000)add('LIMIT','');
 if(dispositions.some(d=>d.relevance!=='unselected'&&d.fidelity!=='exact'))add('LOSS','');
 for(const diagnostic of diagnostics.filter(d=>d.code==='UNKNOWN_RELEVANT')){
  const matching=dispositions.filter(d=>d.sourceId===diagnostic.sourceId&&(d.pointer===diagnostic.pointer||d.pointer.startsWith(diagnostic.pointer+'/')));
  for(const d of matching){d.fidelity='unknown';d.checks=[];d.reason='Uninterpreted relevant assertion retained; generation refuses';}
  if(!matching.length)dispositions.push({id:'d'+dispositions.length,sourceId:diagnostic.sourceId,pointer:diagnostic.pointer,assertion:'unknown',relevance:'selected',fidelity:'unknown',checks:[],reason:'Uninterpreted relevant assertion retained; generation refuses',obligationIds:[]});
 }
 const endpointNames=new Set<string>();
 for(const action of ir.actions??[]){const endpoint=action.python.replace(/([a-z0-9])([A-Z])/g,'$1_$2').toLowerCase();if(pythonKeywords.has(endpoint)||endpointNames.has(endpoint))add('NAME',action.pointer);endpointNames.add(endpoint);}
 const unique=new Map(diagnostics.map(d=>[JSON.stringify([d.sourceId,d.pointer,d.code,d.accessCode]),d]));diagnostics.splice(0,diagnostics.length,...unique.values());
 return finish(ir);
 function markNotExpressible(path:string){for(const d of dispositions)if(d.pointer===path||d.pointer.startsWith(path+'/')){d.fidelity='not-expressible';d.checks=[];d.reason='Carrier is not qualified by this emitter';}}
 function resolveName(id:string,role:'class'|'field',pointer:string):string{
  const overrides=request.names.filter(n=>n.sourceId===request.logical&&n.pointer===pointer);
  if(overrides.length>1){add('NAME',pointer);return '_invalid';}
  const words=id.replace(/([A-Z]+)([A-Z][a-z])/g,'$1_$2').replace(/([a-z0-9])([A-Z])/g,'$1_$2').split('_');
  const name=overrides[0]?.python??(role==='field'?words.join('_').toLowerCase():words.map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(''));
  if(!overrides.length&&!/^[a-zA-Z][a-zA-Z0-9]*$/.test(id)||!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)||pythonKeywords.has(name)||name.startsWith('model_')||['c','s','objects'].includes(name)||profile.reservedNames.includes(name)||profile.importedNames.includes(name)||['StrictModel','Decimal','date','datetime','Annotated','ClassVar','TYPE_CHECKING','final','BeforeValidator','MISSING','TypeAdapter','FieldRef','RecordRef','Join','JoinProjection','Column','Query','Terminal','Related','Param','Mapping','MappingProxyType','TypedDict','Unpack','TypeVar','ActionRef','ActionSource','ActionProfile','FieldValidator','seal_model','unhashable_key','ValueNormalizer','encode_model','decode_model','initialize_rejection','GeneratedSource','UMF_GENERATED_SOURCE','UMF_SOURCE','CodecField','UMF_FINAL','UMF_KEY','Literal','Never','BUNDLE_INPUT_DIGEST','KEY_IDENTITY','UMF_PROJECTION_FIELDS','UMF_UPDATE_FIELDS','Actions','ReplayingActions','ActionEndpoint','ReplayingActionEndpoint','ActionExecutor','ReplayingActionExecutor','ActionRejected','OriginalOutcome','UMF_BUNDLE_INPUT_DIGEST','UMF_RUNTIME_ABI','Vector','KeywordIndex','VectorIndex','RankedQuery','SearchLeg','Score','Scored','SearchResult','KeyTypeRef','RecordTypeRef','OutcomeDetails','ExecutorT','ReplayingExecutorT','Generic','cast','Committed','make_committed_view','UMF_FIELDS'].includes(name)||name.startsWith('validate_field_'))add('NAME',pointer);
  return name;
 }
}
const pythonKeywords=new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case type'.split(' '));
export {diffAccessPackages,type AccessSymbolChange} from './diff';
