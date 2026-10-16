/** CONTRACT-070's presence policy; no storage or value semantics are inferred. */
export interface Presence {missing:boolean;null:boolean}
export interface FieldView {field?:{module:string;element:string};row:Presence;create:Presence;mutable:boolean;generated:boolean;temporal?:'instant'|'local'}
export interface PresenceFacts {key:boolean;availability:string;admitsNull:boolean;defaultOn:string;generated:boolean;bound:boolean;notNull:readonly boolean[];nested?:boolean}
export function checkAccessPresence(f:PresenceFacts,v:FieldView):boolean {
 if(f.generated!==v.generated||f.availability==='unspecified'||!['required','absent-allowed'].includes(f.availability))return false;
 if(f.key&&(f.availability!=='required'||f.admitsNull||v.mutable))return false;
 if(f.availability==='required'&&f.admitsNull)return false;
 if(f.nested)return !f.key&&!v.generated&&!v.mutable&&!v.row.missing&&!v.create.missing&&(!v.row.null||f.admitsNull)&&(!v.create.null||f.admitsNull);
 if(f.bound&&(!f.notNull.length||f.notNull.some(n=>n!==!v.row.null)||v.row.missing))return false;
 if(v.generated){
  return v.create.missing&&!v.create.null&&!v.row.missing&&(!v.row.null||(f.bound&&f.admitsNull));
 }
 if(f.key||f.availability==='required'){
  const omittable=!f.key&&['missing','missing-or-null'].includes(f.defaultOn);
  return !v.row.missing&&!v.row.null&&!v.create.null&&(!v.create.missing||omittable);
 }
 if(v.create.null&&!f.admitsNull)return false;
 if(f.bound)return f.admitsNull||!v.row.null;
 return v.row.missing&&v.row.null===f.admitsNull;
}

import {inspectCoreElementKind,inspectCoreNullability,inspectCoreCardinality,inspectCoreKeys,inspectCoreFacets,inspectCoreSchemaProperties,validateCoreFieldValue,validateDocument,getBinding,inspectBinding,inspectRawTableBinding,RAW_TABLE_BINDING_SUBSET,type Document,type Element} from '../../../index';
import type {AccessDiagnostic,Ref,ResolvedField,ResolvedRecord} from '../../ir/index';
export interface SuppliedBinding {sourceId:string;document:Document}
interface View {record:Ref;selectedKey:Ref&{key:string};fields:(FieldView&{field:Ref})[]}
interface NativeColumn {field:Ref;type:string;notNull:boolean;generation:null|'identity'|'stored-expression'|'default'}
interface ColumnSet {binding:{sourceId:string;module:string};target:{platform:string;majorVersion:string};columns:NativeColumn[]}
const identity=(r:Ref)=>JSON.stringify([r.module,r.element]);
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const reference=(v:unknown):v is Ref=>object(v)&&typeof v.module==='string'&&!!v.module&&typeof v.element==='string'&&!!v.element&&Object.keys(v).every(k=>k==='module'||k==='element');
const presence=(v:unknown):v is Presence=>object(v)&&typeof v.missing==='boolean'&&typeof v.null==='boolean';
/** Contextual read-only declaration checks. Native execution is never implied. */
export function inspectAccessViews(document:Document,selected:readonly Ref[],bindings:readonly SuppliedBinding[]=[],sourceId='logical'):{records:ResolvedRecord[];diagnostics:AccessDiagnostic[]} {
 const diagnostics:AccessDiagnostic[]=[],records:ResolvedRecord[]=[];
 const add=(accessCode:string,pointer:string)=>diagnostics.push({code:'ACCESS',accessCode,sourceId,pointer,message:'Authored access declaration violates '+accessCode});
 const unknown=(pointer:string)=>diagnostics.push({code:'UNKNOWN_RELEVANT',sourceId,pointer,message:'Selected access meaning is uninterpreted'});
 if(document.umf!=='0.8.0'||!validateDocument(document).valid){add('ACCESS_SHAPE','');return {records,diagnostics};}
 if(document.vocabularies['umf.access']?.version!=='0.1.0'){add('ACCESS_SHAPE','/vocabularies/umf.access');return {records,diagnostics};}
 const locate=(r:Ref)=>{const mi=document.modules.findIndex(m=>m.id===r.module),ei=document.modules[mi]?.elements.findIndex(e=>e.id===r.element)??-1;return {element:document.modules[mi]?.elements[ei],path:`/modules/${mi}/elements/${ei}`};};
 const allViews:{view:View;path:string}[]=[],allColumns:{set:ColumnSet;path:string}[]=[];
 for(const [mi,authoredModule] of document.modules.entries()){
  const payload=authoredModule.extensions?.['umf.access'],base=`/modules/${mi}/extensions/umf.access`;
  if(payload===undefined)continue;
  if(!object(payload)||!['views','columns','search','searchBindings'].every(k=>Array.isArray(payload[k]))){add('ACCESS_SHAPE',base);continue;}
  const moduleSelected=selected.some(r=>r.module===authoredModule.id);
  if(moduleSelected)for(const key of Object.keys(payload))if(!['views','columns','search','searchBindings'].includes(key))unknown(base+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1'));
  (payload.views as unknown[]).forEach((entry,i)=>{
   const path=base+`/views/${i}`;
   if(!object(entry)||!reference(entry.record)||!Array.isArray(entry.fields)){add('ACCESS_SHAPE',path);return;}
   const record=locate(entry.record);
   if(!record.element||record.element.kind!=='record'||entry.record.module!==authoredModule.id)add('ACCESS_REFERENCE',path+'/record');
   for(const [fi,field] of entry.fields.entries())if(!object(field)||!reference(field.field)||!presence(field.row)||!presence(field.create)||typeof field.mutable!=='boolean'||typeof field.generated!=='boolean'||(field.temporal!==undefined&&!['instant','local'].includes(String(field.temporal))))add('ACCESS_SHAPE',path+`/fields/${fi}`);
   if(entry.fields.every(f=>object(f)&&reference(f.field)&&presence(f.row)&&presence(f.create)))allViews.push({view:entry as unknown as View,path});
  });
  (payload.columns as unknown[]).forEach((entry,i)=>{
   const path=base+`/columns/${i}`;
   if(!object(entry)||!object(entry.binding)||typeof entry.binding.sourceId!=='string'||typeof entry.binding.module!=='string'||!object(entry.target)||typeof entry.target.platform!=='string'||typeof entry.target.majorVersion!=='string'||!Array.isArray(entry.columns)){add('ACCESS_SHAPE',path);return;}
   if(entry.columns.some(c=>!object(c)||!reference(c.field)||typeof c.type!=='string'||typeof c.notNull!=='boolean'||![null,'identity','stored-expression','default'].includes(c.generation as null))){add('ACCESS_SHAPE',path+'/columns');return;}
   allColumns.push({set:entry as unknown as ColumnSet,path});
  });
 }
 const seenViews=new Set<string>(),seenSets=new Set<string>();
 for(const {view,path} of allViews){const id=identity(view.record);if(seenViews.has(id))add('ACCESS_REFERENCE',path+'/record');seenViews.add(id);}
 for(const {set,path} of allColumns){
  const key=JSON.stringify([set.binding.sourceId,set.binding.module,set.target]);if(seenSets.has(key))add('ACCESS_REFERENCE',path);seenSets.add(key);
  const supplied=bindings.filter(b=>b.sourceId===set.binding.sourceId);
  if(supplied.length!==1){add('ACCESS_REFERENCE',path+'/binding');continue;}
  try{
   const binding=getBinding(supplied[0]!.document,document);
   if(!inspectBinding(supplied[0]!.document,document).complete){unknown(path+'/binding');}
   const selectedSet=set.columns.some(c=>selected.some(r=>{const e=locate(r).element;return Array.isArray(e?.members)&&(e.members as Ref[]).some(f=>identity(f)===identity(c.field));}));
   const unchecked=(value:object,allowed:string[],pointer:string)=>{if(selectedSet)for(const key of Object.keys(value))if(!allowed.includes(key))unknown(pointer+'/'+key.replace(/~/g,'~0').replace(/\//g,'~1'));};
   unchecked(set,['binding','target','columns'],path);unchecked(set.binding,['sourceId','module'],path+'/binding');unchecked(set.target,['platform','majorVersion'],path+'/target');
   for(const [ci,column] of set.columns.entries())unchecked(column,['field','type','notNull','generation'],path+'/columns/'+ci);
   if(['lakebase','spark-delta','unity-catalog'].includes(set.target.platform)){
    if(binding.target.subset!==RAW_TABLE_BINDING_SUBSET||!inspectRawTableBinding(supplied[0]!.document,document,set.target,set.binding.module).complete)add('ACCESS_REFERENCE',path+'/target');
   }else if(set.target.platform!=='postgresql'||binding.target.system!=='postgresql'||binding.target.version.split('.')[0]!==set.target.majorVersion)add('ACCESS_REFERENCE',path+'/target');
   for(const selectedRef of selected){
    if(!binding.elements.some(e=>identity(e)===identity(selectedRef)))continue;
    const selectedRecord=locate(selectedRef).element;
    for(const member of Array.isArray(selectedRecord?.members)?selectedRecord.members as Ref[]:[]){
     if(!binding.fields.some(f=>identity(f)===identity(member)&&f.storage==='column')||!set.columns.some(c=>identity(c.field)===identity(member)))add('ACCESS_COVERAGE',path+'/columns');
    }
   }
   const seen=new Set<string>();
   for(const [ci,column] of set.columns.entries()){
    const id=identity(column.field);if(seen.has(id))add('ACCESS_REFERENCE',path+`/columns/${ci}`);seen.add(id);
    if(column.field.module!==set.binding.module||!binding.fields.some(f=>identity(f)===id&&f.storage==='column'&&!!f.column))add('ACCESS_REFERENCE',path+`/columns/${ci}/field`);
   }
  }catch{add('ACCESS_REFERENCE',path+'/binding');}
 }
 for(const ref of selected){
  const located=locate(ref),node=located.element;
  if(!node){add('ACCESS_REFERENCE',located.path);continue;}
  const kind=inspectCoreElementKind(document,ref).meaning;
  if(kind.state!=='known'||kind.kind!=='record'){add('ACCESS_REFERENCE',located.path);continue;}
  const candidates=allViews.filter(v=>identity(v.view.record)===identity(ref));
  if(candidates.length!==1){add('ACCESS_REFERENCE',located.path);continue;}
  const {view,path}=candidates[0]!;
  for(const key of Object.keys(view))if(!['record','selectedKey','fields'].includes(key))unknown(path+'/'+key);
  const members=Array.isArray(node.members)?node.members as Ref[]:[];
  const expected:{ref:Ref;nested:boolean}[]=[],seen=new Set<string>(),memberIds=new Set(members.map(identity));
  const collect=(r:Ref,nested:boolean,stack:Set<string>)=>{
   if(!reference(r)){add('ACCESS_REFERENCE',path+'/fields');return;}
   const id=identity(r);if(stack.has(id))return;
   const field=locate(r).element;if(!field||inspectCoreElementKind(document,r).meaning.state!=='known'||field.kind!=='field'){add('ACCESS_REFERENCE',path+'/fields');return;}
   if(!seen.has(id)){expected.push({ref:r,nested});seen.add(id);}
   const card=inspectCoreCardinality(document,r).meaning;
   if(card.state==='known'&&card.itemType){const next=new Set(stack);next.add(id);collect(card.itemType,true,next);}
  };
  // First list all owned members, then reached nested item/value Fields.
  for(const r of members)if(reference(r)){if(!seen.has(identity(r))){expected.push({ref:r,nested:false});seen.add(identity(r));}}else add('ACCESS_REFERENCE',located.path+'/members');
  for(const r of members)if(reference(r))collect(r,false,new Set());
  if(expected.length!==view.fields.length||expected.some((r,i)=>identity(r.ref)!==identity(view.fields[i]?.field??{module:'',element:''})))add('ACCESS_COVERAGE',path+'/fields');
  const keyMeaning=inspectCoreKeys(document,ref).meaning;
  if(keyMeaning.state==='partial'||keyMeaning.state==='legacy')unknown(located.path+'/keys');
  const keys=keyMeaning.state==='known'||keyMeaning.state==='partial'?keyMeaning.keys:[];
  const selection=view.selectedKey;
  if(!object(selection)||selection.module!==ref.module||selection.element!==ref.element||typeof selection.key!=='string'||!keys.some(k=>k.id===selection.key)||Object.keys(selection).some(k=>!['module','element','key'].includes(k)))add('ACCESS_REFERENCE',path+'/selectedKey');
  const orderedKeys=[...keys].sort((a,b)=>Number(b.id===selection?.key)-Number(a.id===selection?.key));
  const resolved:ResolvedField[]=[];
  for(const [fi,fv] of view.fields.entries()){
   const fp=path+`/fields/${fi}`,field=locate(fv.field).element,expectedField=expected.find(e=>identity(e.ref)===identity(fv.field));
   if(!field||!expectedField){add('ACCESS_REFERENCE',fp+'/field');continue;}
   for(const k of Object.keys(fv))if(!['field','row','create','mutable','generated','temporal'].includes(k))unknown(fp+'/'+k);
   for(const [label,value] of [['row',fv.row],['create',fv.create]] as const)for(const k of Object.keys(value))if(!['missing','null'].includes(k))unknown(fp+'/'+label+'/'+k);
   const availability=inspectCoreNullability(document,fv.field).meaning;
   const properties=inspectCoreSchemaProperties(document,{scope:'element',...fv.field}).properties;
   const facets=inspectCoreFacets(document,fv.field).meaning;
   if(facets.state==='partial')for(const pointer of facets.uninterpretedPaths)unknown(pointer);
   const columns=allColumns.flatMap(c=>c.set.columns.filter(n=>identity(n.field)===identity(fv.field)).map(column=>({column,set:c.set,path:c.path})));
   const key=keys.some(k=>k.fields.some(r=>identity(r)===identity(fv.field)));
   const defaultOn=object(properties.default)?String(properties.default.on):'none';
   const valid=checkAccessPresence({key,availability:availability.state==='known'?availability.nullability:'unspecified',admitsNull:validateCoreFieldValue(document,fv.field,null).valid,defaultOn,generated:fv.generated,bound:columns.length>0,notNull:columns.map(c=>c.column.notNull),nested:expectedField.nested&&!memberIds.has(identity(fv.field))},fv);
   if(!valid||key&&['date','timestamp'].includes(field.scalarType??'')||(field.scalarType==='timestamp')!==(fv.temporal!==undefined)||fv.generated&&columns.some(c=>c.column.generation===null))add('ACCESS_CONFLICT',fp);
   const interpreted=facets.state==='known'||facets.state==='partial'?facets.interpreted:{};
   for(const c of columns)if(!nativeDeclarationCompatible(field,fv,c.column,c.set,{...interpreted}))add('ACCESS_NATIVE',c.path+'/columns');
   const card=inspectCoreCardinality(document,fv.field).meaning;
   resolved.push({ref:{...fv.field},pointer:locate(fv.field).path,owned:memberIds.has(identity(fv.field)),viewPointer:fp,python:'',logicalName:typeof field.name==='string'?field.name:null,scalarType:field.scalarType??null,cardinality:card.state==='known'?card.cardinality:'unspecified',row:{...fv.row},create:{...fv.create},mutable:fv.mutable,generated:fv.generated,...(fv.temporal?{temporal:fv.temporal}:{}),facets:{...interpreted},properties,...(card.state==='known'&&card.itemType?{item:card.itemType}:{} )});
  }
  records.push({ref:{...ref},pointer:located.path,python:'',namespace:document.modules.find(m=>m.id===ref.module)!.namespace,logicalName:typeof node.name==='string'?node.name:null,fields:resolved,keys:orderedKeys.map(k=>({id:k.id,fields:k.fields.map(r=>({...r}))})),selected:true});
 }
 return {records,diagnostics};
}
function nativeDeclarationCompatible(field:Element,view:FieldView,column:NativeColumn,set:ColumnSet,facets:Record<string,unknown>):boolean {
 // Declarative spellings only, not native equivalence or execution qualification.
 if(set.target.platform!=='postgresql'||set.target.majorVersion!=='18')return false;
 const type=column.type;
 if(field.scalarType==='integer'){
  const width=facets.integerWidth;
  return object(width)&&width.signed===true&&({16:['smallint','int2'],32:['integer','int','int4'],64:['bigint','int8']} as Record<number,string[]>)[Number(width.bits)]?.includes(type)===true;
 }
 if(field.scalarType==='decimal')return typeof facets.precision==='number'&&typeof facets.scale==='number'&&type===`numeric(${facets.precision},${facets.scale})`;
 if(field.scalarType==='timestamp')return view.temporal==='instant'?['timestamptz','timestamp with time zone'].includes(type):['timestamp','timestamp without time zone'].includes(type);
 return ({string:['text'],boolean:['boolean','bool'],binary:['bytea'],date:['date']} as Record<string,string[]>)[field.scalarType??'']?.includes(type)===true;
}
