import type {AccessRequest,ResolvedAccess,ResolvedRecord,ResolvedField,AccessSymbol,Ref} from '../../ir/index';
const py=(v:unknown):string=>v===null?'None':typeof v==='boolean'?(v?'True':'False'):typeof v==='string'?JSON.stringify(v).replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029'):typeof v==='number'?String(v):Array.isArray(v)?'['+v.map(py).join(', ')+']':v&&typeof v==='object'?'{'+Object.entries(v).map(([k,x])=>py(k)+': '+py(x)).join(', ')+'}':'None';
const eq=(a:Ref,b:Ref)=>a.module===b.module&&a.element===b.element;
const cls=(s:string)=>s.replace(/([A-Z]+)([A-Z][a-z])/g,'$1_$2').replace(/([a-z0-9])([A-Z])/g,'$1_$2').split('_').map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join('');
const coreLiteral=(v:unknown):string=>{if(v===null)return 'None';if(v&&typeof v==='object'){const x=v as Record<string,unknown>;if(typeof x.integerToken==='string')return `int(${py(x.integerToken)})`;if(typeof x.decimalToken==='string')return `Decimal(${py(x.decimalToken)})`;if(typeof x.binaryHex==='string')return `bytes.fromhex(${py(x.binaryHex)})`;if(typeof x.string==='string')return py(x.string);if(typeof x.boolean==='boolean')return py(x.boolean);}throw new Error('Unresolved literal cannot be emitted');};
const scalar=(f:ResolvedField)=>({boolean:'bool',integer:'int',decimal:'Decimal',string:'str',binary:'bytes',date:'date',timestamp:'datetime'} as Record<string,string>)[f.scalarType??'']??'object';
const validator=(f:ResolvedField,mode:'row'|'create'='row')=>'validate_field_'+(f.viewPointer??f.pointer).replace(/[^A-Za-z0-9]/g,'_')+(['array','map'].includes(f.cardinality)?'_'+mode:'');
const presentType=(f:ResolvedField,p:{missing:boolean;null:boolean},validate=true)=>`${validate?'Annotated['+scalar(f)+', BeforeValidator('+validator(f)+')]':scalar(f)}${p.null?' | None':''}${p.missing?' | MISSING':''}`;
/** Literal-only source renderer. It emits no imports selected by document text. */
export function emitPythonAccess(ir:ResolvedAccess,request:AccessRequest,inputDigest:string,documentSha256:string):{texts:{path:string;text:string}[];symbols:AccessSymbol[]} {
 const texts:{path:string;text:string}[]=[],symbols:AccessSymbol[]=[],base=request.package+'/';
 const projectionName=(p:AccessRequest['projections'][number])=>request.names.find(n=>n.sourceId===request.logical&&n.pointer==='/projections/'+request.projections.indexOf(p))?.python??cls(p.name);
 const keyName=(r:ResolvedRecord,id:string)=>r.python+(r.keys[0]?.id===id?'':cls(id.replace(/[^A-Za-z0-9]/g,'_')))+'Key';
 const projectionField=(root:ResolvedRecord,ref:Ref):{owner:ResolvedRecord;field:ResolvedField}=>{const own=root.fields.find(f=>f.owned!==false&&eq(f.ref,ref));if(own)return {owner:root,field:own};const candidates=ir.records.filter(r=>r.selected).flatMap(r=>r.fields.filter(f=>f.owned!==false&&eq(f.ref,ref)).map(field=>({owner:r,field})));if(candidates.length!==1)throw new Error('Ambiguous joined projection Field');return candidates[0]!;};
 const allFields=ir.records.flatMap(r=>r.fields);
 const carrier=(f:ResolvedField,mode:'row'|'create',validated:boolean,seen=new Set<string>()):string=>{
  if(!f.item)return scalar(f);
  if(seen.has(f.pointer))throw new Error('Unresolved recursive item carrier');seen.add(f.pointer);
  const child=allFields.find(c=>eq(c.ref,f.item!)&&c.viewPointer?.split('/fields/')[0]===f.viewPointer?.split('/fields/')[0])??allFields.find(c=>eq(c.ref,f.item!));if(!child)throw new Error('Missing item carrier');
  const base=carrier(child,mode,validated,seen),nullable=(mode==='row'?child.row:child.create).null;
  const item=(validated?'Annotated['+base+', BeforeValidator('+validator(child,mode)+')]':base)+(nullable?' | None':'');
  return f.cardinality==='array'?`list[${item}] | tuple[${item}, ...]`:`dict[${validated?'Annotated[str, BeforeValidator(validate_string)]':'str'}, ${item}]`;
 };
 const presentType=(f:ResolvedField,p:{missing:boolean;null:boolean},validate=true,mode:'row'|'create'='row')=>{const type=carrier(f,mode,validate);return (validate?'Annotated['+type+', BeforeValidator('+validator(f,mode)+')]':type)+(p.null?' | None':'')+(p.missing?' | MISSING':'');};
 const emit=(path:string,lines:string[])=>texts.push({path:base+path,text:lines.join('\n').replace(/\n*$/,'')+'\n'});
 const symbol=(r:ResolvedRecord,path:string,name:string,role:AccessSymbol['role'])=>symbols.push({sourceId:ir.sourceId,pointer:r.pointer,path:base+path,symbol:name,role});
 const pre=['# Generated from pinned UMF inputs. Regenerate; do not edit.','from __future__ import annotations'];
 const models=[...pre,'from datetime import date, datetime','from decimal import Decimal','from typing import Annotated, ClassVar, TYPE_CHECKING, final','from pydantic import BeforeValidator, MISSING, TypeAdapter','from umf_access.dsl import FieldRef, GeneratedSource','from umf_access.types import StrictModel','from umf_access.codec_support import seal_model','from umf_access.values import validate_integer, validate_decimal, validate_string, validate_date, validate_instant, validate_local, validate_boolean, validate_binary, validate_length, validate_range, validate_allowed, FieldValidator',
  `UMF_GENERATED_SOURCE = GeneratedSource(document_id=${py(ir.documentId)}, core_version="0.8.0", document_sha256=${py(documentSha256)}, input_digest=${py(inputDigest)}, runtime_abi="umf-access-runtime/0.1")`,'if TYPE_CHECKING:',...ir.records.filter(r=>r.selected).flatMap(r=>[`    from .fields import ${r.python}Columns, ${r.python}Query`]),''];
 const keys=[...pre,'from typing import Annotated, ClassVar, Mapping, TypeVar, final','from datetime import date, datetime','from decimal import Decimal','from types import MappingProxyType','from umf_access.dsl import GeneratedSource','from pydantic import BeforeValidator','from .models import *','from .models import UMF_GENERATED_SOURCE',...ir.records.flatMap(r=>r.fields.map(f=>'from .models import '+validator(f))),'from umf_access.types import StrictModel',`BUNDLE_INPUT_DIGEST = ${py(inputDigest)}`,'from umf_access.codec_support import seal_model, unhashable_key',''];
 const fields=[...pre,'from datetime import date, datetime','from decimal import Decimal','from typing import TypedDict, overload, ClassVar, Mapping','from types import MappingProxyType','from umf_access.dsl import Join, JoinProjection, Column, FieldRef, RecordRef, Query, Terminal, Related, Param', 'from pydantic import MISSING','from .models import *','from .models import UMF_GENERATED_SOURCE','from .keys import *',''];
 const codecs=[...pre,'from .models import *','from .keys import *','from umf_access.codec_support import CodecField, encode_model, decode_model',''];
 const codecField=(f:ResolvedField,r:ResolvedRecord):string=>`{"python": ${py(f.python)}, "field": ${py(f.ref.element)}, "kind": ${py(f.item?f.cardinality:f.scalarType==='timestamp'&&f.temporal==='instant'?'instant':'identity')}, "item": ${f.item?codecField(r.fields.find(x=>eq(x.ref,f.item!))??allFields.find(x=>eq(x.ref,f.item!))!,r):'None'}}`;
 const codecMetadata=(name:string,fs:ResolvedField[],r:ResolvedRecord)=>{const metadata='_codec_'+name;codecs.push(`${metadata}: tuple[CodecField, ...] = (${fs.map(f=>codecField(f,r)).join(', ')}${fs.length?',':''})`);return metadata;};
 const validatorLines:string[]=[];const modelHeaderLength=models.length;
 const emittedValidators=new Set<string>();
 for(const r of ir.records){
  const renderValidator=(f:ResolvedField):void=>{
   if(emittedValidators.has(validator(f)))return;
   if(f.item){const child=r.fields.find(c=>eq(c.ref,f.item!));if(child)renderValidator(child);}
   emittedValidators.add(validator(f));
   for(const mode of (f.item?['row','create']:['row']) as ('row'|'create')[]){
   const type=carrier(f,mode,true),adapter='_adapter'+validator(f,mode);
   if(f.item)validatorLines.push(`${adapter}: TypeAdapter[${type}] = TypeAdapter(${type})`);

   const args=[`kind=${py(f.scalarType==='timestamp'?f.temporal:f.scalarType??f.cardinality)}`];
   if(f.item)args.push(`adapter=${adapter}`);
   if(f.scalarType==='integer')args.push(`bits=${py((f.facets.integerWidth as {bits?:number}|undefined)?.bits??null)}`,`signed=${py((f.facets.integerWidth as {signed?:boolean}|undefined)?.signed??true)}`);
   if(f.scalarType==='decimal')args.push(`precision=${py(f.facets.precision??null)}`,`scale=${py(f.facets.scale??null)}`);
   const length=(f.facets.length??f.facets.collectionSize) as {min?:number;max?:number}|undefined;
   if(length)args.push(`minimum=${py(length.min??null)}`,`maximum=${py(length.max??null)}`);
   const range=f.facets.range as {min?:unknown;max?:unknown;minInclusive?:boolean;maxInclusive?:boolean}|undefined;
   if(range)args.push(`range_min=${range.min===undefined?'None':coreLiteral(range.min)}`,`range_max=${range.max===undefined?'None':coreLiteral(range.max)}`,`min_inclusive=${py(range.minInclusive??true)}`,`max_inclusive=${py(range.maxInclusive??true)}`);
   if(Array.isArray(f.properties.allowedValues))args.push(`allowed=(${f.properties.allowedValues.map(coreLiteral).join(', ')}${f.properties.allowedValues.length?',':''})`);
   validatorLines.push(`${validator(f,mode)} = FieldValidator(${args.join(', ')})`,'');
   }
  };
  for(const f of r.fields)renderValidator(f);
  for(const [suffix,role] of (r.selected?([['','row'],['Create','create'],['Patch','patch']] as const):[])){
   const fs=r.fields.filter(f=>f.owned!==false&&(!suffix||!f.generated&&(suffix!=='Patch'||f.mutable)));
   models.push('@final',`class ${r.python}${suffix}(StrictModel):`,'    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE');
   if(!suffix)models.push(`    c: ClassVar[${r.python}Columns]`,`    objects: ClassVar[${r.python}Query]`);
   for(const f of fs){const p=!suffix?f.row:suffix==='Create'?f.create:{missing:true,null:f.create.null};models.push(`    ${f.python}: ${presentType(f,p,true,!suffix?'row':'create')}${p.missing?' = MISSING':''}`);symbols.push({sourceId:ir.sourceId,pointer:f.pointer,path:base+'models.py',symbol:r.python+suffix+'.'+f.python,role});}
   models.push('    UMF_FINAL: ClassVar[bool] = True','');symbol(r,'models.py',r.python+suffix,role);
  }
  const key=r.keys[0];
  for(const currentKey of r.keys){const key=currentKey,keyPython=keyName(r,key.id);keys.push('@final',`class ${keyPython}(StrictModel):`,'    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE','    UMF_KEY: ClassVar[bool] = True',`    KEY_IDENTITY: ClassVar[Mapping[str, str]] = MappingProxyType(${py({documentId:ir.documentId,coreVersion:'0.8.0',module:r.ref.module,element:r.ref.element,key:key.id})})`);
   for(const ref of key.fields){const f=r.fields.find(f=>eq(f.ref,ref))!;keys.push(`    ${f.python}: ${presentType(f,{missing:false,null:false})}`);symbols.push({sourceId:ir.sourceId,pointer:f.pointer,path:base+'keys.py',symbol:keyPython+'.'+f.python,role:'key'});}
   keys.push('    UMF_FINAL: ClassVar[bool] = True','');symbol(r,'keys.py',keyPython,'key');
  }
  if(!r.selected)continue;
  fields.push(`class ${r.python}Columns:`);
  for(const f of r.fields.filter(f=>f.owned!==false))fields.push(`    ${f.python}: Column[${r.python}, ${presentType(f,{missing:false,null:f.row.null},false)}] = Column(FieldRef(source=UMF_GENERATED_SOURCE, module=${py(r.ref.module)}, element=${py(r.ref.element)}, field=${py(f.ref.element)}, field_module=${py(f.ref.module)}, temporal=${py(f.temporal??null)}, logical_name=${py(f.logicalName??null)}))`);
  for(const f of r.fields.filter(f=>f.owned!==false)){
   // PEP 258 attribute docstrings are inert literals adjacent to each declaration.
   const declaration=fields.findIndex(line=>line.startsWith(`    ${f.python}: Column[${r.python},`));
   if(declaration>=0)fields.splice(declaration+1,0,'    '+py('UMF source '+ir.sourceId+'#'+f.pointer));
   symbols.push({sourceId:ir.sourceId,pointer:f.pointer,path:base+'fields.py',symbol:r.python+'.c.'+f.python,role:'fields'});
  }
  for(const relation of ir.relations??[])if(eq(relation.owner,r.ref)){const target=ir.records.find(t=>eq(t.ref,relation.target))!;if(relation.toOne&&target.selected){const key=target.keys.find(k=>k.id===relation.key)!;fields.push(`    ${relation.python}: Join[${r.python}, ${target.python}, ${keyName(target,relation.key)}] = Join(FieldRef(source=UMF_GENERATED_SOURCE, module=${py(r.ref.module)}, element=${py(r.ref.element)}, field=${py(relation.id)}, field_module=${py(relation.module)}, logical_name=${py(relation.logicalName??null)}), RecordRef(source=UMF_GENERATED_SOURCE, key_id=${py(relation.key)}, module=${py(target.ref.module)}, element=${py(target.ref.element)}, logical_namespace=${py(target.namespace??null)}, logical_name=${py(target.logicalName??null)}, key=(${key.fields.map(f=>`FieldRef(source=UMF_GENERATED_SOURCE, module=${py(target.ref.module)}, element=${py(target.ref.element)}, field=${py(f.element)}, field_module=${py(f.module)}, logical_name=${py(target.fields.find(rf=>eq(rf.ref,f))?.logicalName??null)})`).join(', ')},)), optional=${py(relation.optional??false)})`);}else fields.push(`    ${relation.python}: Related[${r.python}, ${keyName(target,relation.key)}] = Related(FieldRef(source=UMF_GENERATED_SOURCE, module=${py(r.ref.module)}, element=${py(r.ref.element)}, field=${py(relation.id)}, field_module=${py(relation.module)}, logical_name=${py(relation.logicalName??null)}))`);fields.push('    '+py('UMF source '+ir.sourceId+'#'+relation.pointer));symbols.push({sourceId:ir.sourceId,pointer:relation.pointer,path:base+'fields.py',symbol:r.python+'.c.'+relation.python,role:'fields'});}
  if(!r.fields.length)fields.push('    pass');
  fields.push('',`class ${r.python}Update(TypedDict, total=False):`);
  const updates=r.fields.filter(f=>f.owned!==false&&f.mutable&&!f.generated);for(const f of updates){const type=presentType(f,{missing:false,null:f.create.null},false,'create');fields.push(`    ${f.python}: ${type} | Param[${type}]`);}if(!updates.length)fields.push('    pass');
  fields.push('',`class ${r.python}Query(Query[${r.python}, ${r.python}, ${key?r.python+'Key':'object'}]):`,`    UMF_UPDATE_FIELDS: ClassVar[Mapping[str, FieldRef]] = MappingProxyType({${updates.map(f=>py(f.python)+': FieldRef(source=UMF_GENERATED_SOURCE, module='+py(r.ref.module)+', element='+py(r.ref.element)+', field='+py(f.ref.element)+', field_module='+py(f.ref.module)+', logical_name='+py(f.logicalName??null)+')').join(', ')}})`,`    def update(self${updates.length?", *, "+updates.map(f=>{const type=presentType(f,{missing:false,null:f.create.null},false,"create");return f.python+": "+type+" | Param["+type+"] | MISSING = MISSING";}).join(", "):""}) -> Terminal[object]:`,`        return self._update_present({${updates.map(f=>py(f.python)+": "+f.python).join(", ")}})`);
  const projections=request.projections.filter(p=>eq(p.record,r.ref));
  if(projections.length===1)fields.push(`    def into(self, model: type[${projectionName(projections[0]!)}]) -> Query[${r.python}, ${projectionName(projections[0]!)}, ${key?r.python+'Key':'object'}]:`,`        return self._into(model)`);
  if(projections.length>1){for(const p of projections)fields.push('    @overload',`    def into(self, model: type[${projectionName(p)}]) -> Query[${r.python}, ${projectionName(p)}, ${key?r.python+'Key':'object'}]: ...`);fields.push(`    def into(self, model: ${projections.map(p=>'type['+projectionName(p)+']').join(' | ')}) -> object:`,`        return self._into(model)`);}
  fields.push('',`${r.python}.c = ${r.python}Columns()`,`${r.python}.objects = ${r.python}Query(RecordRef(source=UMF_GENERATED_SOURCE, key_id=${py(key?.id??null)}, module=${py(r.ref.module)}, element=${py(r.ref.element)}, logical_namespace=${py(r.namespace??null)}, logical_name=${py(r.logicalName??null)}, key=(${(key?.fields??[]).map(f=>`FieldRef(source=UMF_GENERATED_SOURCE, module=${py(r.ref.module)}, element=${py(r.ref.element)}, field=${py(f.element)}, field_module=${py(f.module)}, logical_name=${py(r.fields.find(rf=>eq(rf.ref,f))?.logicalName??null)})`).join(', ')}${key?.fields.length?',':''})))`,'');symbol(r,'fields.py',r.python+'Columns','fields');symbol(r,'fields.py',r.python+'Update','update');
  for(const suffix of ['Create','Patch']){const fs=r.fields.filter(f=>f.owned!==false&&!f.generated&&(suffix!=='Patch'||f.mutable)),name=`encode_${r.python}_${suffix.toLowerCase()}`;
   const metadata=codecMetadata(r.python+suffix,fs,r);
   codecs.push(`def ${name}(value: ${r.python}${suffix}) -> dict[str, object]:`,`    return encode_model(${r.python}${suffix}, value, ${metadata})`,'');symbol(r,'codecs.py',name,'codec');
  }
  const rowMetadata=codecMetadata(r.python,r.fields.filter(f=>f.owned!==false),r);
  codecs.push(`def decode_${r.python}(columns: list[str], row: list[object]) -> ${r.python}:`,`    return decode_model(${r.python}, columns, row, ${rowMetadata})`,'');symbol(r,'codecs.py','decode_'+r.python,'codec');
  for(const projection of projections){const name=projectionName(projection);models.push('@final',`class ${name}(StrictModel):`,'    UMF_SOURCE: ClassVar[GeneratedSource] = UMF_GENERATED_SOURCE',`    UMF_PROJECTION_FIELDS: ClassVar[tuple[FieldRef, ...]] = (${projection.fields.map(f=>{const x=projectionField(r,f);return 'FieldRef(source=UMF_GENERATED_SOURCE, module='+py(x.owner.ref.module)+', element='+py(x.owner.ref.element)+', field='+py(f.element)+', field_module='+py(f.module)+', logical_name='+py(x.field.logicalName??null)+')';}).join(', ')}${projection.fields.length?',':''})`);for(const ref of projection.fields){const x=projectionField(r,ref),f=x.field;models.push(`    ${f.python}: ${presentType(f,{...f.row,null:f.row.null||!eq(x.owner.ref,r.ref)})}${f.row.missing?' = MISSING':''}`);symbols.push({sourceId:ir.sourceId,pointer:f.pointer,path:base+'models.py',symbol:name+'.'+f.python,role:'projection'});}models.push('    UMF_FINAL: ClassVar[bool] = True','');symbol(r,'models.py',name,'projection');fields.push(`${name}Projection: JoinProjection[${r.python}, ${name}] = JoinProjection(${name})`);const metadata=codecMetadata(name,projection.fields.map(ref=>projectionField(r,ref).field),r);codecs.push(`def decode_${name}(columns: list[str], row: list[object]) -> ${name}:`,`    return decode_model(${name}, columns, row, ${metadata})`,'');symbol(r,'codecs.py','decode_'+name,'codec');}
 }
 if(ir.actions?.length){
  const actionLines=[...pre,'from datetime import date, datetime','from decimal import Decimal','from typing import Annotated, ClassVar, Literal, Never, final','from pydantic import BeforeValidator, MISSING, TypeAdapter','from umf_access.types import StrictModel, ActionRef, ActionSource, ActionProfile','from umf_access.codec_support import seal_model, initialize_rejection','from .keys import *',...ir.records.flatMap(r=>r.fields.map(f=>'from .models import '+validator(f))),''];
  for(const action of ir.actions){
   for(const [suffix,parameters,role] of [['Input',action.parameters,'action-input'],['Output',action.outputs,'action-output']] as const){
    actionLines.push('@final',`class ${action.python}${suffix}(StrictModel):`);
    for(const p of parameters){const type=p.entity?keyName(ir.records.find(r=>eq(r.ref,p.entity!))!,p.entityKey!):presentType(p.field!,{missing:!p.required,null:p.field!.row.null});actionLines.push(`    ${p.python}: ${type}${p.required?'':' = MISSING'}`);}
    actionLines.push('    UMF_FINAL: ClassVar[bool] = True','');
    symbols.push({sourceId:ir.sourceId,pointer:action.pointer,path:base+'actions.py',symbol:action.python+suffix,role});
   }
   const outputType=action.kind==='recipe'?'None':action.python+'Output';
   const outputClass=action.kind==='recipe'?'type(None)':action.python+'Output';
   const failureCodes=[...new Set([...action.failures.map(f=>f.code),'ENTITY_MISSING'])];
   const codeType=`Literal[${failureCodes.map(py).join(', ')}]`;
   actionLines.push('@final','@seal_model',`class ${action.python}Rejected(Exception):`,`    code: ${codeType}`,'    retryable: bool',`    def __init__(self, code: ${codeType}) -> None:`,`        initialize_rejection(self, code, ${py(Object.fromEntries([['ENTITY_MISSING',false],...action.failures.map(f=>[f.code,f.retryable])]))})`,'',`${action.python}: ActionRef[${action.python}Input, ${outputType}] = ActionRef(module=${py(action.module)}, action=${py(action.id)}, input_type=${action.python}Input, output_type=${outputClass}, source=ActionSource(documentId=${py(ir.documentId)}, coreVersion=${py(request.coreVersion)}, module=${py(action.module)}, action=${py(action.id)}, documentSha256=${py(documentSha256)}, actionPointer=${py(action.pointer)}, invocation=ActionProfile(id="umf.actions.tx", version="1")))`,'');
   for(const [symbolName,role] of [[action.python,'action-ref'],[action.python+'Rejected','action-failure']] as const)symbols.push({sourceId:ir.sourceId,pointer:action.pointer,path:base+'actions.py',symbol:symbolName,role});
  }
  emit('actions.py',actionLines);
 }
 keys.push(`__all__ = ${py([...ir.records.flatMap(r=>r.keys.map(k=>keyName(r,k.id))),'BUNDLE_INPUT_DIGEST'])}`);
 for(const p of request.projections)models.push(`${projectionName(p)}.model_rebuild()`);
 models.push(`__all__ = ${py([...ir.records.filter(r=>r.selected).flatMap(r=>[r.python,r.python+'Create',r.python+'Patch']),...request.projections.map(projectionName)])}`);
 emit('models.py',[...models.slice(0,modelHeaderLength),...validatorLines,...models.slice(modelHeaderLength)]);emit('keys.py',keys);emit('fields.py',fields);emit('codecs.py',codecs);
 emit('__init__.py',[...pre,'from pydantic import MISSING','from .models import *','from .models import UMF_GENERATED_SOURCE','from .keys import *','from . import fields as _fields',...request.projections.map(p=>'from .fields import '+projectionName(p)+'Projection'),...(ir.actions?.length?['from .actions import *']:[])]);emit('py.typed',[]);
 symbols.push({sourceId:ir.sourceId,pointer:'',path:base+'keys.py',symbol:'BUNDLE_INPUT_DIGEST',role:'key'});
 return {texts,symbols};
}
