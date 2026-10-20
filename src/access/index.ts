// SPDX-License-Identifier: MIT OR Apache-2.0
import {readDocument} from '../model/document';
import {CURRENT_CORE_VERSION,UmfError, type Document, type Element} from '../model/types';
import {admitAction} from '../extensions/actions/structure';
import {analyzeAction} from '../extensions/actions/analysis';
import type {Action} from '../extensions/actions/types';
import {sha256Text} from '../compilation/bundle/index';
import {pythonRuntime} from './python-runtime';
import {tableRuntime} from './table-runtime';
import {tableClients} from './table-client';
import type {FieldInfo,Ref} from './types';

export interface PythonClientRequest {
 text:string; format?:'json'|'yaml'; package:string;
 records?:{module:string;element:string}[];
 actions?:{module:string;action:string}[];
}
export interface PythonClientResult {
 sourceDigest:string; description:Record<string,unknown>;
 files:{path:string;text:string;sha256:string}[];
}
type RecordInfo={id:string;module:string;element:string;python:string;fields:FieldInfo[];key:FieldInfo[];keyId:string;selected:boolean};
const fail=(path:string,message:string):never=>{throw new UmfError('ACCESS_UNSUPPORTED',message,path);};
const object=(v:unknown):Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
const refId=(r:Ref)=>r.module+'.'+r.element;
const keywords=new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case'.split(' '));
const runtimeExports=['AccessError','Unsupported','SchemaMismatch','PreconditionFailed','WriteOutcomeUnknown','write_outcomes_unknown','Page','Receipt','BatchReceipt','BatchItemOutcome','ValidationResult','ExactTimestamp','MISSING','Missing','Transport','AsyncTransport','SyncTransport'] as const;
const reserved=new Set<string>([...runtimeExports,'Any','ClassVar','Literal','RuntimeClient','RuntimeSyncClient','Client','AsyncClient','SyncClient','Actions','AsyncActions','SyncActions','SyncTransport','AsyncTransport','SyncQuery','AccessError','Query','Field','Ordering','Relationship','Receipt','Page','Transport','Missing','ExactTimestamp','Enum','Sequence','BatchReceipt','BatchItemOutcome','ValidationResult','Decimal','UUID','date','MISSING','c','objects']);
function name(raw:string,kind:'class'|'field',path:string):string {
 const words=raw.replace(/([a-z0-9])([A-Z])/g,'$1_$2').replace(/([A-Z]+)([A-Z][a-z])/g,'$1_$2').split(/[_. -]+/);
 const value=kind==='class'?words.map(w=>w[0]?.toUpperCase()+w.slice(1)).join(''):words.map(w=>w.toLowerCase()).join('_');
 if(!/^[A-Za-z][A-Za-z0-9_]*$/.test(value)||keywords.has(value)||reserved.has(value))fail(path,'Name cannot be generated without a collision');
 return value;
}
function py(value:unknown):string {
 if(value===null)return 'None';if(value===true)return 'True';if(value===false)return 'False';
 if(typeof value==='string')return JSON.stringify(value).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 if(typeof value==='number')return String(value);
 if(Array.isArray(value))return '['+value.map(py).join(', ')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).map(([k,v])=>py(k)+': '+py(v)).join(', ')+'}';
 throw new Error('Non-JSON generation metadata');
}
function type(f:FieldInfo,missing=f.missing):string {
 const carriers:Record<string,string>={string:'str',integer:'int',decimal:'Decimal',float:'float',boolean:'bool',binary:'bytes',date:'date',timestamp:'ExactTimestamp',uuid:'UUID',bits128:'bytes'};
 if(!Object.hasOwn(carriers,f.scalar))fail(f.id,'Scalar cannot be represented exactly');
 let result=carriers[f.scalar]!;
 if(f.cardinality==='array')result='tuple['+type(f.item!,false)+', ...]';
 if(f.allowed?.length&&f.allowed.every(v=>typeof v==='string'||typeof v==='boolean'||typeof v==='number'))result='Literal['+f.allowed.map(py).join(', ')+']';
 return result+(f.nullable?' | None':'')+(missing?' | Missing':'');
}

/** Pure portable generator: current UMF source -> stdlib-only typed Python requests. */
export function generatePythonClient(request:PythonClientRequest):PythonClientResult {
 if(!request||typeof request.text!=='string'||!request.package||!(/^[a-z][a-z0-9_]*$/).test(request.package)||keywords.has(request.package)||['uuid','decimal','typing','dataclasses','datetime','base64','re','json','enum','collections'].includes(request.package))fail('/package','Ordinary non-shadowing Python package required');
 const doc=readDocument(request.text,request.format??'json');
 if(doc.umf!==CURRENT_CORE_VERSION)fail('/umf','Use current UMF source');
 const sourceDigest=sha256Text(request.text),elements=new Map<string,Element>();
 for(const [i,m] of doc.modules.entries()){
  for(const [path,value] of [[`/modules/${i}/actions`,m.actions],[`/modules/${i}/extensions/umf.ddd/actions`,object(m.extensions?.['umf.ddd']).actions]] as const){
   if(value!==undefined&&(!Array.isArray(value)||value.length))fail(path,'Unsupported legacy action declarations; convert to current module.extensions[\"umf.actions\"].actions before generation');
  }
 }
 for(const m of doc.modules)for(const e of m.elements){
  const id=refId({module:m.id,element:e.id});
  if(elements.has(id))fail(id,'Qualified identity collision');
  elements.set(id,e);
 }
 const field=(ref:Ref,stack:string[]=[]):FieldInfo=>{
  const id=refId(ref),e=elements.get(id);if(!e||e.kind!=='field')fail(id,'Field reference does not identify a Field');
  if(stack.includes(id)||stack.length>16)fail(id,'Unbounded recursive field');
  if(e!.nullability!=='required'&&e!.nullability!=='absent-allowed')fail(id,'Availability must have a supported explicit meaning');
  const extensions=object(e!.extensions),extensionKeys=Object.keys(extensions);
  if(extensionKeys.some(key=>key!=='hohfeld.view'))fail(id+'/extensions','Unknown selected Field extension meaning');
  if(extensionKeys.length&&(!extensions['hohfeld.view']||typeof extensions['hohfeld.view']!=='object'||Array.isArray(extensions['hohfeld.view'])))fail(id+'/extensions/hohfeld.view','Presentation annotation must be a JSON object');
  const scalar=String(e!.scalarType??''),cardinality=String(e!.cardinality??'');
  const result:FieldInfo={id:ref.element,python:name(String(e!.name??ref.element).split('.').at(-1)!,'field',id),scalar,cardinality,
   missing:e!.nullability==='absent-allowed',nullable:e!.nullability==='absent-allowed',facets:object(e!.facets),semanticTypes:e!.semanticTypes??[],semanticTypeInterpretation:'reference-only'};
  if(extensionKeys.length){result.extensions={'hohfeld.view':extensions['hohfeld.view']};result.extensionInterpretation='opaque-presentation-metadata-only';}
  if(Array.isArray(e!.semanticTypes))for(const semantic of e!.semanticTypes)if(Object.keys(object(semantic)).some(k=>!['vocabulary','version','term'].includes(k)))fail(id+'/semanticTypes','Unknown semantic type qualifier');
  if(cardinality==='array'){
   const item=object(e!.itemType) as Ref;result.item=field(item,[...stack,id]);result.scalar=result.item.scalar;
  }else if(cardinality!=='one')fail(id,'Collection shape is not yet representable');
  if(cardinality!=='one'&&(e!.allowedValues||result.facets.range||result.facets.length))fail(id,'Container refinements require a qualified generated interpreter');
  if(result.facets.range&&!['integer','decimal'].includes(scalar))fail(id,'Range requires an exact numeric carrier');
  if(result.facets.length&&(!['string','binary'].includes(scalar)||object(result.facets.length).unit!==(scalar==='string'?'unicode-scalar':'byte')))fail(id,'Length requires its exact scalar unit');
  for(const [group,keys]of [['range',['min','max','minInclusive','maxInclusive']],['length',['min','max','unit']]] as const)if(result.facets[group]&&Object.keys(object(result.facets[group])).some(k=>!(keys as readonly string[]).includes(k)))fail(id,'Unknown generated domain qualifier');
  const supportedFacets=new Set(['precision','scale','integerWidth','range','length']);
  for(const key of Object.keys(result.facets))if(!supportedFacets.has(key))fail(id+'/facets/'+key,'Facet requires an exact generated validator');
  if(e!.allowedValues){if(!['string','boolean','integer','decimal'].includes(scalar))fail(id,'Enumeration carrier requires an exact generated interpreter');result.allowedLiterals=e!.allowedValues;result.allowed=(e!.allowedValues as unknown[]).map(v=>{const x=object(v);if('string'in x)return x.string;if('boolean'in x)return x.boolean;if('integerToken'in x)return Number.isSafeInteger(Number(x.integerToken))?Number(x.integerToken):undefined;return undefined;});}
  if(result.allowed?.some(v=>v===undefined))delete result.allowed;
  type(result);return result;
 };
 const wanted=request.records&&new Set(request.records.map(refId));
 const records:RecordInfo[]=[],used=new Set<string>(reserved);
 const nativeSelected=doc.modules.some(m=>Object.hasOwn(m.extensions??{},'umf.tables')&&m.elements.some(e=>e.kind==='record'&&(!wanted||wanted.has(m.id+'.'+e.id))));
 if(nativeSelected){
  if((request.format??'json')!=='json')fail('/format','Native operation clients currently require original JSON source');
  for(const symbol of ['ModuleClients','SyncModuleClients','Applied','Recovered','NotObserved','EffectReceipt','MutationItem','table_call','table_call_sync'])used.add(symbol);
 }
 const native=tableClients(doc,wanted,{field,name,type,py,fail,used});
 for(const m of doc.modules)for(const e of m.elements){
  if(e.kind!=='record'||!Array.isArray(e.keys)||!e.keys.length)continue;
  const id=refId({module:m.id,element:e.id}),keys=e.keys as {id:string;primary?:boolean;fields:Ref[]}[];
  if(Object.hasOwn(m.extensions??{},'umf.tables'))continue;
  const key=keys.find(k=>k.primary)??(keys.length===1?keys[0]:undefined);if(!key)fail(id,'Record requires an unambiguous identity Key');
  const python=name(String(e.name??e.id),'class',id);
  for(const symbol of [python,python+'Key',python+'Columns']){if(used.has(symbol))fail(id,'Generated type collision');used.add(symbol);}
  const keyFields=key!.fields.map(r=>field(r)),selected=!wanted||wanted.has(id);
  const fields=selected?(e.members as Ref[]).map(r=>field(r)):keyFields;
  if(new Set(fields.map(f=>f.python)).size!==fields.length)fail(id,'Field name collision');
  if(keyFields.some(f=>f.missing||f.nullable||f.cardinality!=='one'))fail(id,'Identity components must be required scalars');
  records.push({id,module:m.id,element:e.id,python,fields,key:keyFields,keyId:key!.id,selected});
 }
 if(wanted)for(const id of wanted)if(!records.some(r=>r.id===id)&&!native.ids.has(id))fail(id,'Selected Record not found');
 if(!records.some(r=>r.selected)&&!native.modules.length)fail('/records','Select at least one keyed Record');
 const rels:{owner:string;target:string;module:string;id:string;python:string;direction:'forward'|'inverse';sourceMultiplicity:unknown;targetMultiplicity:unknown}[]=[];
 for(const m of doc.modules)for(const raw of (m.relationships??[]) as any[]){
  const owner=records.find(r=>r.id===refId(raw.source?.[0]??{})),target=records.find(r=>r.id===refId(raw.target?.[0]??{}));
  if((native.ids.has(refId(raw.source?.[0]??{}))&&target?.selected)||(native.ids.has(refId(raw.target?.[0]??{}))&&owner?.selected))fail(m.id+'/'+raw.id,'Cross-profile relationship requires explicit lowering');
  if(!owner||!target||!owner.selected&&!target.selected)continue;
  if(raw.source.length!==1||raw.target.length!==1||raw.directed!==true||raw.target[0].key!==target.keyId)fail(m.id+'/'+raw.id,'Relationship endpoint meaning requires explicit lowering');
  const python=name(String(raw.name??raw.id),'field',m.id+'/'+raw.id);
  if(owner.fields.some(f=>f.python===python)||rels.some(r=>r.owner===owner.id&&r.python===python))fail(m.id+'/'+raw.id,'Relationship/field name collision');
  rels.push({owner:owner.id,target:target.id,module:m.id,id:raw.id,python,direction:'forward',sourceMultiplicity:raw.sourceMultiplicity,targetMultiplicity:raw.targetMultiplicity});
  const inverse=name(String(raw.inverse??raw.id+'_inverse'),'field',m.id+'/'+raw.id+'/inverse');
  if(target.fields.some(f=>f.python===inverse)||rels.some(r=>r.owner===target.id&&r.python===inverse))fail(m.id+'/'+raw.id,'Inverse name collision');
  rels.push({owner:target.id,target:owner.id,module:m.id,id:raw.id,python:inverse,direction:'inverse',sourceMultiplicity:raw.targetMultiplicity,targetMultiplicity:raw.sourceMultiplicity});
 }
 const actions:{module:string;id:string;python:string;raw:Action;parameters:any[];affected:string[]}[]=[];
 const actionSelection=request.actions&&new Set(request.actions.map(r=>r.module+'.'+r.action));
 const actionIds=new Set<string>();
 for(const [moduleIndex,m] of doc.modules.entries()){
  const actionPayload=m.extensions?.['umf.actions'],payload=object(actionPayload);
  if(actionPayload!==undefined){
   const path=`/modules/${moduleIndex}/extensions/umf.actions`;
   if(!actionPayload||typeof actionPayload!=='object'||Array.isArray(actionPayload)||!Array.isArray(payload.actions))fail(path,'Expected an action declaration object with an actions array');
   if(doc.vocabularies['umf.actions']?.version!=='0.1.0')fail('/vocabularies/umf.actions/version','Unsupported action vocabulary version');
   for(const key of Object.keys(payload))if(key!=='actions')fail(path+'/'+key.replaceAll('~','~0').replaceAll('/','~1'),'Unknown action declaration qualifier');
  }
  for(const [actionIndex,raw] of (payload.actions??[]).entries()){
   const actionPath=`/modules/${moduleIndex}/extensions/umf.actions/actions/${actionIndex}`;
   if(!raw||typeof raw!=='object'||Array.isArray(raw)||typeof raw.id!=='string'||!raw.id)fail(actionPath,'Action inventory entries require a nonempty identity');
   const id=m.id+'.'+raw.id;
   if(actionIds.has(id))fail(actionPath+'/id','Qualified action identity collision');actionIds.add(id);
   if(actionSelection&&!actionSelection.has(id))continue;
   if(Object.hasOwn(m.extensions??{},'umf.tables'))fail('/modules/'+doc.modules.indexOf(m)+'/extensions/umf.tables','Native table lifecycle action interpretation is not qualified');
   const action=(()=>{try{return admitAction(raw);}catch(error){return fail(actionPath,error instanceof Error?'Invalid action declaration: '+error.message:'Invalid action declaration');}})();
   if(action.binding.kind==='recipe'&&(action.binding.profile.id!=='graph-write'||!['1','2'].includes(action.binding.profile.version)))fail(id+'/binding/profile','Unsupported selected recipe profile');
   const nativeDependency=doc.modules.find(module=>Object.hasOwn(module.extensions??{},'umf.tables')&&[...action.reads,...action.writes].some(frame=>frame.record.module===module.id));
   if(nativeDependency)fail('/modules/'+doc.modules.indexOf(nativeDependency)+'/extensions/umf.tables','Native table lifecycle action interpretation is not qualified');
   const analysis=analyzeAction(doc,action,'/modules/'+m.id+'/actions/'+raw.id);
   if(analysis.diagnostics.some(d=>d.severity==='error'))fail(id,'Invalid action declarations: '+analysis.diagnostics.filter(d=>d.severity==='error').map(d=>d.code).join(','));
   if(action.binding.kind==='recipe'&&analysis.obligations.some(o=>o.status==='unchecked'&&(o.kind==='unknown'||o.kind==='effect')&&o.path.includes('/binding')))fail(id+'/binding','Uninterpreted selected recipe meaning');
   if(action.outputs.length)fail(id,'Action declares unsupported business outputs');
   const parameterNames=new Set<string>();
   const parameters=action.parameters.map((p,parameterIndex)=>{
    const python=name(String(p.name??p.id),'field',id+'/'+p.id);
    if(parameterNames.has(python))fail(actionPath+'/parameters/'+parameterIndex,'Generated parameter name collision');parameterNames.add(python);
    if(['self','idempotency_key'].includes(python))fail(id+'/'+p.id,'Parameter conflicts with generated method signature');
    if(p.kind==='entity'){
     const r=records.find(r=>r.id===refId(p.target));if(!r||r.keyId!==p.target.key)fail(id+'/'+p.id,'Entity parameter must use its declared generated Key');
     return {id:p.id,python,required:p.required,record:r!.id};
    }
    return {id:p.id,python,required:p.required,field:field(p.field)};
   });
   const affected=[...new Set(action.writes.map(w=>refId(w.record)))];
   if(affected.some(r=>!records.some(x=>x.id===r)))fail(id,'Action affected Record is not representable');
   const python=name(action.id,'field',id);if(actions.some(a=>a.python===python))fail(id,'Action method collision');
   actions.push({module:m.id,id,python,raw:action,parameters,affected});
  }
 }
 if(actionSelection)for(const id of actionSelection)if(!actions.some(a=>a.id===id))fail(id,'Selected Action not found');
 const metadata=Object.fromEntries(records.map(r=>[r.id,{fields:r.fields,key:r.key,key_id:r.keyId,selected:r.selected}]));
 const actionMetadata=Object.fromEntries(actions.map(a=>[a.id,{parameters:a.parameters,affected:a.affected,preconditions:a.raw.preconditions.map(c=>({id:c.id,failure:c.failure})),operations:['apply','apply_batch','validate'],declaration:a.raw}]));
 const description={contract:'umf.access/1',umf:doc.umf,sourceDigest,records:metadata,relationships:rels,actions:actionMetadata,...(native.modules.length?{tableModules:native.modules,nativeExecutionQualified:false}:{}),errorCodes:['INVALID','DENIED','CONFLICT','PRECONDITION_FAILED','TOO_MANY_ROWS','LIMIT_EXCEEDED','BUSY','UNSUPPORTED','SCHEMA_MISMATCH','WRITE_OUTCOME_UNKNOWN','NOT_YET_CURRENT','INVALID_CURSOR'],limits:{page:100,getManyKeys:100,batchItems:100}};
 const lines=['# SPDX-License-Identifier: MIT OR Apache-2.0','# Generated from UMF '+CURRENT_CORE_VERSION+'. Regenerate; do not edit.','from __future__ import annotations','from dataclasses import dataclass','from enum import Enum','from collections.abc import Sequence','from datetime import date','from decimal import Decimal','from uuid import UUID','from typing import Any, ClassVar, Literal, cast','from ._runtime import Client as RuntimeClient, SyncClient as RuntimeSyncClient, Query, SyncQuery, Field, Relationship, Missing, MISSING, Transport, SyncTransport, AsyncTransport, Receipt, BatchReceipt, BatchItemOutcome, ValidationResult, ExactTimestamp, AccessError, validate_model',`SOURCE_DIGEST = ${py(sourceDigest)}`,`_METADATA: dict[str, Any] = ${py(metadata)}`,`_ACTIONS: dict[str, Any] = ${py(actionMetadata)}`,''];
 if(native.modules.length)lines.push('from ._runtime import Page','from ._table_runtime import Applied, Recovered, NotObserved, EffectReceipt, MutationItem, table_call, table_call_sync','',...native.lines);
 for(const r of records){
  lines.push('@dataclass(frozen=True)',`class ${r.python}Key:`);
  for(const f of r.key)lines.push(`    ${f.python}: ${type(f,false)}`);
  lines.push('    def __post_init__(self) -> None:',`        validate_model(self, _METADATA[${py(r.id)}]['key'])`,'');
  if(!r.selected)continue;
  lines.push('@dataclass(frozen=True)',`class ${r.python}:`,`    c: ClassVar[${r.python}Columns]`,`    objects: ClassVar[Query[${r.python}, ${r.python}Key]]`);
  for(const f of [...r.fields.filter(f=>!f.missing),...r.fields.filter(f=>f.missing)])lines.push(`    ${f.python}: ${type(f)}${f.missing?' = MISSING':''}`);
  lines.push('    def __post_init__(self) -> None:',`        validate_model(self, _METADATA[${py(r.id)}]['fields'])`,'');
 }
 for(const r of records){
  if(!r.selected){lines.push(`cast(dict[str, Any], _METADATA[${py(r.id)}]).update(key_type=${r.python}Key)`);continue;}
  lines.push(`class ${r.python}Columns:`);
  for(const f of r.fields)lines.push(`    ${f.python}: Field[${r.python}, ${type(f,false)}] = Field(${py(r.id)}, ${py(f)})`);
  for(const rel of rels.filter(rel=>rel.owner===r.id&&records.some(target=>target.id===rel.target&&target.selected))){
   const target=records.find(x=>x.id===rel.target)!;
   lines.push(`    ${rel.python}: Relationship[${r.python}, ${target.python}, ${r.python}Key, ${target.python}Key] = Relationship(${[r.id,target.id,rel.module,rel.id,rel.direction].map(py).join(', ')})`);
  }
  lines.push('',`${r.python}.c = ${r.python}Columns()`,`${r.python}.objects = Query(${py(r.id)})`,`cast(dict[str, Any], _METADATA[${py(r.id)}]).update(row_type=${r.python}, key_type=${r.python}Key)`,'');
 }
 for(const a of actions){
  const className=name(a.raw.id,'class',a.id);
  for(const symbol of [className+'Input',className+'Precondition']){if(used.has(symbol))fail(a.id,'Generated action type collision');used.add(symbol);}
  lines.push('@dataclass(frozen=True, kw_only=True)',`class ${className}Input:`);
  for(const p of a.parameters)lines.push(`    ${p.python}: ${p.record?records.find(r=>r.id===p.record)!.python+'Key':type(p.field,false)}${p.required?'':' | Missing = MISSING'}`);
  if(!a.parameters.length)lines.push('    pass');
  lines.push('',`class ${className}Precondition(str, Enum):`);
  const members=new Set<string>();
  for(const condition of a.raw.preconditions){
   const member=name(condition.id,'field',a.id+'/preconditions/'+condition.id).toUpperCase();
   if(['NAME','VALUE','MRO'].includes(member)||members.has(member))fail(a.id+'/preconditions/'+condition.id,'Precondition enum member collision');members.add(member);
   lines.push(`    ${member} = ${py(condition.id)}`);
  }
  if(!members.size)lines.push('    pass');
  lines.push('');
 }
 for(const mode of [{client:'Client',base:'RuntimeClient',actions:'Actions',async:true},{client:'SyncClient',base:'RuntimeSyncClient',actions:'SyncActions',async:false}]){
  const transport=mode.async?'Transport':'SyncTransport';
  lines.push(`class ${mode.client}(${mode.base}):`,`    def __init__(self, transport: ${transport}) -> None:`,
   '        super().__init__(transport, SOURCE_DIGEST, _METADATA, _ACTIONS)',...(native.modules.length?[`        self.modules: ${mode.async?'ModuleClients':'SyncModuleClients'} = ${mode.async?'ModuleClients':'SyncModuleClients'}(self)`]:[]),'',`class ${mode.actions}:`,
   `    def __init__(self, client: ${mode.client}) -> None:`,
   `        if not isinstance(client, ${mode.base}): raise AccessError('CLIENT_TYPE')`,
   '        self._client = client','');
  for(const a of actions){
   const params=a.parameters.map(p=>p.python+': '+(p.record?records.find(r=>r.id===p.record)!.python+'Key':type(p.field,false))+(p.required?'':' | Missing = MISSING'));
   const affected=a.affected.map(id=>records.find(r=>r.id===id)!.python+'Key').join(' | ')||'None';
   const inputName=name(a.raw.id,'class',a.id)+'Input',argumentsText='{'+a.parameters.map(p=>py(p.python)+': '+p.python).join(', ')+'}';
   for(const method of [a.python,a.python+'_batch',a.python+'_validate']){
    if(actions.some(other=>other!==a&&other.python===method))fail(a.id,'Generated action terminal collision');
   }
   lines.push(`    ${mode.async?'async ':''}def ${a.python}(self, *, ${[...params,'idempotency_key: str | None = None'].join(', ')}) -> Receipt[${affected}, None]:`,
    `        return cast(Receipt[${affected}, None], ${mode.async?'await ':''}self._client.apply(${py(a.id)}, ${argumentsText}, idempotency_key=idempotency_key))`,'',
    `    ${mode.async?'async ':''}def ${a.python}_validate(self${params.length?', *, '+params.join(', '):''}) -> ValidationResult:`,
    `        return ${mode.async?'await ':''}self._client.validate(${py(a.id)}, ${argumentsText})`,'',
    `    ${mode.async?'async ':''}def ${a.python}_batch(self, items: Sequence[${inputName}], *, atomic: bool = False, stop_on_error: bool = False, idempotency_key: str | None = None) -> BatchReceipt[${affected}, None]:`,
    `        return cast(BatchReceipt[${affected}, None], ${mode.async?'await ':''}self._client.apply_batch(${py(a.id)}, items, ${inputName}, atomic=atomic, stop_on_error=stop_on_error, idempotency_key=idempotency_key))`,'');
  }
 }
 lines.push('AsyncClient = Client','AsyncActions = Actions','');
 const files=[{path:request.package+'/__init__.py',text:'# SPDX-License-Identifier: MIT OR Apache-2.0\nfrom .models import *\nfrom ._runtime import '+runtimeExports.map(symbol=>symbol+' as '+symbol).join(', ')+'\n'},
 {path:request.package+'/models.py',text:lines.join('\n')+'\n'},
 {path:request.package+'/_runtime.py',text:pythonRuntime},
 ...(native.modules.length?[{path:request.package+'/_table_runtime.py',text:tableRuntime}]:[]),
 {path:request.package+'/source.json',text:request.text},
 {path:request.package+'/description.json',text:JSON.stringify(description,null,2)+'\n'},
 {path:request.package+'/py.typed',text:''}].map(f=>({...f,sha256:sha256Text(f.text)}));
 const manifest={contract:'umf.access/1',sourceDigest,descriptionDigest:sha256Text(JSON.stringify(description)),inventory:files.map(({path,sha256})=>({path,sha256}))};
 const manifestText=JSON.stringify(manifest,null,2)+'\n';
 files.push({path:request.package+'/_umf/manifest.json',text:manifestText,sha256:sha256Text(manifestText)});
 return {sourceDigest,description,files};
}
