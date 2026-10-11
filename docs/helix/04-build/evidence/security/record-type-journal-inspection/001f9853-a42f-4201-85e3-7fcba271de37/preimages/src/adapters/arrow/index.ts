import manifest from '../../../spec/extensions/arrow/package.json';
import schema from '../../../spec/extensions/arrow/integration-schema.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {createValidator} from '../../validation/schema';
import {copyJson} from '../../model/json';
import {parseNativeJson,renderTree,nativePointer,treeChild,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage} from '../../model/types';
export const ARROW_EXTENSION='umf.arrow';
export const arrowPackage=manifest as unknown as ExtensionPackage;
type Payload={profile:'arrow-integration-schema';root:NativeJson};
const known=new Map((schema.$defs.type.anyOf as any[]).filter(t=>t.properties.name.const).map(t=>[t.properties.name.const,t]));
let check:ReturnType<ReturnType<typeof createValidator>['compile']>|undefined;
function exactInteger(token:string):bigint|undefined{
 const m=/^(-?)([0-9]+)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/.exec(token);if(!m)return;
 let digits=(m[2]!+(m[3]??'')).replace(/^0+/,'');if(!digits)return 0n;
 const scale=BigInt((m[3]??'').length)-BigInt(m[4]??'0');
 if(scale>0n){if(scale>=BigInt(digits.length)||!/^[0]+$/.test(digits.slice(-Number(scale))))return;digits=digits.slice(0,-Number(scale));}
 else {if(BigInt(digits.length)-scale>19n)return;digits+='0'.repeat(Number(-scale));}
 if(digits.length>19)return;return BigInt(m[1]+digits);
}
function inspect(value:Json):Diagnostic[]{
 const p=value as unknown as Payload;const ds:Diagnostic[]=[{code:'ARROW_NATIVE_UNVERIFIED',path:'',severity:'warning',message:'Schema JSON preservation does not establish IPC, dictionary-data, extension-type or record-batch validity'}];
 const add=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>ds.push({code,path,message,severity});
 if(Object.keys(p).some(k=>!['profile','root'].includes(k)))add('ARROW_REPRESENTATION','','Unknown representation fields must stay in UMF');
 function tagged(n:NativeJson,path:string){const keys=n.kind==='null'?['kind']:n.kind==='object'?['kind','members']:n.kind==='array'?['kind','items']:['kind','value'];if(Object.keys(n).some(k=>!keys.includes(k)))add('ARROW_REPRESENTATION',path,'Unknown tagged-tree fields must stay in UMF');if(n.kind==='object')for(const [k,v] of Object.entries(n.members))tagged(v,path+'/'+pointer(k));if(n.kind==='array')n.items.forEach((v,i)=>tagged(v,path+'/'+i));}
 tagged(p.root,'/root');const view=JSON.parse(renderTree(p.root));check??=createValidator(false).compile(schema);
 if(!check(view)){for(const e of check.errors??[])add('ARROW_STRUCTURE',e.instancePath,e.message??'Invalid schema JSON','error');return ds;}
 function unknown(v:any,keys:string[],path:string){for(const k of Object.keys(v))if(!keys.includes(k))add('ARROW_UNKNOWN',path+'/'+pointer(k),'Native content retained without interpretation');}
 function metadata(entries:any[],path:string){const keys=new Set<string>();entries.forEach((e,i)=>{unknown(e,['key','value'],path+'/'+i);if(keys.has(e.key))add('ARROW_DUPLICATE_METADATA',path+'/'+i,'Ordered duplicate metadata retained; native Map conversion may collapse it');keys.add(e.key);});}
 function integerAt(path:string){let n=p.root;for(const key of nativePointer(path))n=treeChild(n,key);if(n.kind!=='number'||exactInteger(n.value)===undefined)add('ARROW_INTEGER',path,'Known integer parameter must be exact, not a rounded host value','error');}
 function field(f:any,path:string){
  unknown(f,['name','nullable','type','children','metadata','dictionary'],path);metadata(f.metadata??[],path+'/metadata');
  const type=known.get(f.type.name);if(!type)add('ARROW_UNKNOWN_TYPE',path+'/type','Future or unrecognized Arrow type retained');else unknown(f.type,Object.keys(type.properties),path+'/type');
  if(type)for(const [key,rule] of Object.entries(type.properties) as [string,any][]){if(Object.hasOwn(f.type,key)&&(rule.type==='integer'||typeof rule.enum?.[0]==='number'))integerAt(path+'/type/'+pointer(key));}
  if(f.type.name==='union')f.type.typeIds.forEach((_:unknown,i:number)=>integerAt(path+'/type/typeIds/'+i));
  const children=f.children??[];
  if(['list','largelist','listview','largelistview','fixedsizelist','map'].includes(f.type.name)&&children.length!==1)add('ARROW_CHILDREN',path+'/children','This native type requires one child field','error');
  if(f.type.name==='runendencoded'&&children.length!==2)add('ARROW_CHILDREN',path+'/children','Run-end encoding requires run-ends and values children','error');
  if(type&&!['list','largelist','listview','largelistview','fixedsizelist','map','struct','struct_','union','runendencoded'].includes(f.type.name)&&children.length)add('ARROW_CHILDREN',path+'/children','Primitive type cannot have child fields','error');
  if(f.type.name==='map'&&(children[0]?.nullable!==false||!['struct','struct_'].includes(children[0]?.type?.name)||children[0]?.children?.length!==2||children[0]?.children?.[0]?.nullable!==false))add('ARROW_MAP',path+'/children','Map requires non-null entries struct with two children and non-null key','error');
  if(f.type.name==='runendencoded'&&(children[0]?.nullable!==false||children[0]?.type?.name!=='int'||children[0]?.type?.isSigned!==true||![16,32,64].includes(children[0]?.type?.bitWidth)))add('ARROW_RUN_ENDS',path+'/children/0','Run ends must be non-null signed int16/int32/int64','error');
  if(f.type.name==='union'&&f.type.typeIds.length!==children.length)add('ARROW_UNION',path+'/type/typeIds','Union type IDs must correspond to children','error');
  if(f.type.name==='time'&&f.type.bitWidth!==(['SECOND','MILLISECOND'].includes(f.type.unit)?32:64))add('ARROW_TIME',path+'/type','Time unit and bit width disagree','error');
  if(f.type.name==='decimal'&&f.type.precision>({32:9,64:18,128:38,256:76} as any)[f.type.bitWidth??128])add('ARROW_DECIMAL',path+'/type','Decimal precision exceeds its bit width','error');
  if(f.dictionary){let id=p.root;for(const part of nativePointer(path+'/dictionary/id'))id=treeChild(id,part);const number=id.kind==='number'?exactInteger(id.value):undefined;if(number===undefined||number< -9223372036854775808n||number>9223372036854775807n)add('ARROW_DICTIONARY_ID',path+'/dictionary/id','Dictionary IDs must be exact signed 64-bit integers','error');unknown(f.dictionary,['id','indexType','isOrdered'],path+'/dictionary');if(f.dictionary.indexType){integerAt(path+'/dictionary/indexType/bitWidth');unknown(f.dictionary.indexType,['name','bitWidth','isSigned'],path+'/dictionary/indexType');}}
  children.forEach((c:any,i:number)=>field(c,path+'/children/'+i));
 }
 unknown(view,['fields','metadata'],'');metadata(view.metadata??[],'/metadata');view.fields.forEach((f:any,i:number)=>field(f,'/fields/'+i));return ds;
}
export function arrowRegistry(){return new Registry().register(arrowPackage,inspect);}
export function inspectArrow(document:Document){return validateDocument(document,arrowRegistry());}
function payload(document:Document):Payload{
 const checked=inspectArrow(document);if(!checked.valid)throw new UmfError('ARROW_DOCUMENT',JSON.stringify(checked.diagnostics));
 const value=document.modules.find(m=>m.id==='schema')?.elements.find(e=>e.id==='schema')?.extensions[ARROW_EXTENSION];
 if(!value||document.vocabularies[ARROW_EXTENSION]?.version!=='0.1.0')throw new UmfError('ARROW_PAYLOAD','Expected Arrow schema payload');return copyJson(value) as unknown as Payload;
}
export function importArrowSchema(text:string,options:{id:string}):Document{
 const document:Document={umf:'0.1.0',id:options.id,vocabularies:{[ARROW_EXTENSION]:{version:'0.1.0'}},modules:[{id:'schema',namespace:'',elements:[{id:'schema',extensions:{[ARROW_EXTENSION]:{profile:'arrow-integration-schema',root:parseNativeJson(text)} as unknown as Json}}]}]};payload(document);return document;
}
export function exportArrowSchema(document:Document){const p=payload(document);if(inspectArrow(document).diagnostics.some(d=>d.code==='ARROW_REPRESENTATION'))throw new UmfError('ARROW_EXPORT','Unknown representation fields cannot be discarded');return renderTree(p.root);}
export function getArrowNode(document:Document,path:string){let n=payload(document).root;for(const part of nativePointer(path))n=treeChild(n,part);return copyJson(n) as unknown as NativeJson;}
export function proposeArrowNodeEdit(document:Document,path:string,text:string){
 const p=payload(document);const replacement=parseNativeJson(text),parts=nativePointer(path);
 if(!parts.length)p.root=replacement;else{let n=p.root;for(const key of parts.slice(0,-1))n=treeChild(n,key);const key=parts.at(-1)!;treeChild(n,key);if(n.kind==='object')n.members[key]=replacement;else if(n.kind==='array')n.items[Number(key)]=replacement;else throw new UmfError('ARROW_EDIT','Expected existing node');}
 const next=copyJson(document) as unknown as Document;next.modules.find(m=>m.id==='schema')!.elements.find(e=>e.id==='schema')!.extensions[ARROW_EXTENSION]=p as unknown as Json;payload(next);return {document:next,validation:inspectArrow(next)};
}
