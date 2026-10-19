import {readDocument} from '../../model/document';
import type {Document} from '../../model/types';
import {inspectAccessViews} from './access/index';
import type {AccessResult,AccessSymbol,AccessSource,ResolvedRecord,ResolvedField} from '../ir/index';
export interface AccessSymbolChange {symbol:string;role:AccessSymbol['role'];classification:'source-compatible'|'value-compatible'|'breaking';change:'added'|'removed'|'changed'|'unchanged';reason:string;before?:AccessSymbol;after?:AccessSymbol}
const stable=(v:unknown):string=>Array.isArray(v)?'['+v.map(stable).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable((v as Record<string,unknown>)[k])).join(',')+'}':JSON.stringify(v);
interface Signature {fields:Record<string,{type:unknown;missing:boolean;null:boolean}>;identity?:unknown}
function inspectPackage(result:AccessResult){
 if(result.outcome!=='candidate')throw new Error('ACCESS_DIFF_INPUT');
 const archive=result.files.find(f=>f.path.endsWith('/_umf/sources.json'));if(!archive)throw new Error('ACCESS_DIFF_INPUT');
 const sources=JSON.parse(archive.text) as AccessSource[],documents=new Map(sources.map(s=>[s.id,readDocument(s.text,s.format)]));
 const cache=new Map<string,ResolvedRecord|undefined>();
 const locate=(s:AccessSymbol)=>{const document=documents.get(s.sourceId),parts=s.pointer.split('/');if(!document||parts[1]!=='modules'||parts[3]!=='elements')return undefined;const authoredModule=document.modules[Number(parts[2])],element=authoredModule?.elements[Number(parts[4])];return authoredModule&&element?{document,authoredModule,element,path:`/modules/${parts[2]}/elements/${parts[4]}`} :undefined;};
 const record=(s:AccessSymbol)=>{
  const location=locate(s);if(!location||location.element.kind!=='record')return undefined;
  const key=s.sourceId+s.pointer;if(cache.has(key))return cache.get(key);
  const record=inspectAccessViews(location.document,[{module:location.authoredModule.id,element:location.element.id}],sources.filter(x=>x.id!==s.sourceId).map(x=>({sourceId:x.id,document:documents.get(x.id)!})),s.sourceId).records[0];cache.set(key,record);return record;
 };
 const shape=(f:ResolvedField,fields:ResolvedField[],active=new Set<string>()):unknown=>{
  if(active.has(f.pointer))return {recursive:true};active.add(f.pointer);
  const child=f.item?fields.find(x=>x.ref.module===f.item!.module&&x.ref.element===f.item!.element):undefined;
  return {scalar:f.scalarType,cardinality:f.cardinality,temporal:f.temporal??null,facets:f.facets,allowedValues:f.properties.allowedValues??null,...(child?{item:shape(child,fields,active)}:{})};
 };
 const publicName=(r:ResolvedRecord,f:ResolvedField)=>{
  const field=result.symbols.find(s=>s.pointer===f.pointer&&s.role==='fields'&&s.symbol.includes('.c.'));
  if(field)return field.symbol.split('.c.')[1]!;
  const key=result.symbols.find(s=>s.pointer===f.pointer&&s.role==='key'&&s.symbol.includes('.'));return key?.symbol.split('.').slice(1).join('.')??f.python;
 };
 const signature=(s:AccessSymbol):Signature|undefined=>{
  const location=locate(s);if(!location)return undefined;
  if(location.element.kind==='field'){
   const ownerName=s.symbol.split('.c.')[0]!.split('.')[0]!;
   const owner=result.symbols.find(o=>o.symbol===ownerName&&['row','create','patch','update','key','projection'].includes(o.role));
   const r=owner?record(owner):undefined,f=r?.fields.find(f=>f.pointer===s.pointer);if(!r||!f)return undefined;
   const p=s.role==='key'?{missing:false,null:false}:s.role==='create'?f.create:s.role==='patch'||s.role==='update'?{missing:true,null:f.create.null}:f.row;return {fields:{value:{type:shape(f,r.fields),...p}}};
  }
  const r=record(s);if(!r)return undefined;
  const mode=s.role==='create'||s.role==='patch'||s.role==='update'?'create':'row';
  let fields=r.fields.filter(f=>f.owned!==false);
  if(s.role==='create')fields=fields.filter(f=>!f.generated);
  if(s.role==='patch'||s.role==='update')fields=fields.filter(f=>!f.generated&&f.mutable);
  const recordName=result.symbols.find(x=>x.sourceId===s.sourceId&&x.pointer===s.pointer&&x.role==='row')?.symbol;
  const className=(id:string)=>id.replace(/[^A-Za-z0-9]/g,'_').replace(/([A-Z]+)([A-Z][a-z])/g,'$1_$2').replace(/([a-z0-9])([A-Z])/g,'$1_$2').split('_').map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join('');
  const selectedKey=s.role==='key'?(recordName?r.keys.find((key,index)=>recordName+(index===0?'':className(key.id))+'Key'===s.symbol):r.keys.length===1?r.keys[0]:undefined):undefined;
  if(s.role==='key')fields=(selectedKey?.fields??[]).flatMap(ref=>r.fields.filter(f=>f.ref.module===ref.module&&f.ref.element===ref.element));
  if(s.role==='codec'&&s.symbol.startsWith('decode_')){
   const projection=s.symbol.slice('decode_'.length);
   const attrs=result.symbols.filter(a=>a.role==='projection'&&a.symbol.startsWith(projection+'.'));
   if(attrs.length)fields=fields.filter(f=>attrs.some(a=>a.pointer===f.pointer));
  }
  if(s.role==='projection'){
   const attrs=result.symbols.filter(a=>a.role==='projection'&&a.symbol.startsWith(s.symbol+'.'));
   if(!attrs.length)return undefined;fields=fields.filter(f=>attrs.some(a=>a.pointer===f.pointer));
  }
  if(!['row','create','patch','update','fields','key','projection','codec'].includes(s.role))return undefined;
  const fs:Signature['fields']={};
  for(const f of fields){const p=s.role==='key'?{missing:false,null:false}:mode==='row'?f.row:{missing:s.role==='patch'||s.role==='update'?true:f.create.missing,null:f.create.null};fs[publicName(r,f)]={type:shape(f,r.fields),...p};}
  return {fields:fs,...(s.role==='key'?{identity:{document:location.document.id,core:location.document.umf,ref:r.ref,key:selectedKey}}:{}),...(s.role==='codec'?{identity:fields.map(f=>f.ref)}:{})};
 };
 return {signature};
}
/** Conservative source-compatibility report; never target/data compatibility or authorization. */
export function diffAccessPackages(before:AccessResult,after:AccessResult):AccessSymbolChange[] {
 const old=inspectPackage(before),next=inspectPackage(after),key=(s:AccessSymbol)=>s.role+'\0'+s.symbol;
 const previous=new Map(before.symbols.map(s=>[key(s),s])),current=new Map(after.symbols.map(s=>[key(s),s])),changes:AccessSymbolChange[]=[];
 for(const id of [...new Set([...previous.keys(),...current.keys()])].sort()){
  const a=previous.get(id),b=current.get(id),s=b??a!;
  if(!a){changes.push({symbol:s.symbol,role:s.role,classification:'source-compatible',change:'added',reason:'New public symbol; existing source remains valid',after:b!});continue;}
  if(!b){changes.push({symbol:s.symbol,role:s.role,classification:'breaking',change:'removed',reason:'Previously public symbol removed',before:a});continue;}
  const oldSignature=old.signature(a),newSignature=next.signature(b),same=oldSignature&&newSignature?stable(oldSignature)===stable(newSignature):before.files.find(f=>f.path===a.path)?.sha256===after.files.find(f=>f.path===b.path)?.sha256;
  let compatible=s.symbol==='BUNDLE_INPUT_DIGEST'||!!same;
  if(oldSignature&&newSignature&&!same&&stable(oldSignature.identity??null)===stable(newSignature.identity??null)){
   compatible=Object.entries(oldSignature.fields).every(([name,f])=>stable(f)===stable(newSignature.fields[name]))&&Object.entries(newSignature.fields).filter(([name])=>!Object.hasOwn(oldSignature.fields,name)).every(([,f])=>s.role==='fields'||f.missing);
  }
  if(a.path!==b.path||stable(before.runtimeAbi)!==stable(after.runtimeAbi))compatible=false;
  changes.push({symbol:s.symbol,role:s.role,classification:compatible?'source-compatible':'breaking',change:same?'unchanged':'changed',reason:compatible?'Existing typed fields and required inputs preserved; no data/native compatibility inferred':'Removed/retyped input, changed identity/constraints, ABI or unqualified compatibility',before:a,after:b});
 }
 return changes;
}
