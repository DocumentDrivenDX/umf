import manifest from '../../../spec/extensions/lakeview/package.json';
import {validateDocument} from '../../validation/document';
import {parseNativeJson,renderTree,cloneTree,type NativeJson} from '../../model/native-json';
import {UmfError,pointer,type Document,type Json,type Diagnostic,type ExtensionPackage,type Scope} from '../../model/types';
import {dashboardRegistry,DASHBOARD_EXTENSION} from '../../extensions/dashboard';
import {projectLakeview,elementKey,type LakeviewIssue} from './project';
export {type LakeviewIssue} from './project';
export const LAKEVIEW_EXTENSION='umf.lakeview';
export const lakeviewPackage=manifest as unknown as ExtensionPackage;
type ObjectTree=Extract<NativeJson,{kind:'object'}>;
type Payload={kind:'dashboard'|'page';native:ObjectTree;order:string[]}|{kind:'data'}|{kind:'dataset'|'layout-item';native:ObjectTree};
export interface LakeviewImport {document:Document;issues:LakeviewIssue[];}
const scopes:Record<string,Scope>={'dashboard':'document','page':'module','data':'module','dataset':'element','layout-item':'element'};
const wrapper:Record<string,string[]>={'dashboard':['kind','native','order'],'page':['kind','native','order'],'data':['kind'],'dataset':['kind','native'],'layout-item':['kind','native']};
// Members rebuilt from modules and elements on export rather than stored in the native fragment.
const rebuilt:Record<string,string[]>={'dashboard':['datasets','pages'],'page':['layout']};
const lv=(owner:{extensions?:Record<string,Json>}|undefined)=>owner?.extensions?.[LAKEVIEW_EXTENSION] as any;
function inspect(value:Json,context:{document:Document;path:string;scope:Scope}):Diagnostic[]{
 const p=value as any,doc=context.document,out:Diagnostic[]=[];
 const add=(code:string,path:string,message:string,severity:'error'|'warning'='error')=>out.push({code,path:context.path+path,message,severity});
 if(context.scope==='document')add('LAKEVIEW_CONTEXT_UNVERIFIED','','Widget specs, queries and expressions are retained exactly but not validated against a Databricks workspace','warning');
 if(scopes[p.kind]!==context.scope){add('LAKEVIEW_SCOPE','','Lakeview payload has the wrong attachment scope');return out;}
 for(const key of Object.keys(p))if(!wrapper[p.kind]!.includes(key))add('LAKEVIEW_REPRESENTATION','/'+pointer(key),'Unknown representation fields must remain in UMF','warning');
 function tagged(n:NativeJson,path:string){const keys=n.kind==='null'?['kind']:n.kind==='array'?['kind','items']:n.kind==='object'?['kind','members']:['kind','value'];if(Object.keys(n).some(k=>!keys.includes(k)))add('LAKEVIEW_REPRESENTATION',path,'Unknown tagged-tree fields must remain in UMF','warning');if(n.kind==='object')for(const [k,v] of Object.entries(n.members))tagged(v,path+'/'+pointer(k));if(n.kind==='array')n.items.forEach((v,i)=>tagged(v,path+'/'+i));}
 if(p.native){tagged(p.native,'/native');if(p.native.kind!=='object')add('LAKEVIEW_NATIVE','/native','Native root must be a JSON object');}
 if(context.scope!=='document'&&lv(doc)?.kind!=='dashboard')add('LAKEVIEW_ROOT','','Lakeview modules and elements require a document-level dashboard payload');
 const localIndex=/\/modules\/(\d+)/.exec(context.path),local=localIndex?doc.modules[Number(localIndex[1])]:undefined;
 if(p.kind==='dataset'&&lv(local)?.kind!=='data')add('LAKEVIEW_PLACEMENT','','Datasets belong in a Lakeview data module');
 if(p.kind==='layout-item'&&lv(local)?.kind!=='page')add('LAKEVIEW_PLACEMENT','','Layout items belong in a Lakeview page module');
 if(rebuilt[p.kind]&&p.native?.kind==='object'){
  const members=Object.keys(p.native.members),order=p.order as string[],extra=rebuilt[p.kind]!;
  if(members.some(k=>extra.includes(k)))add('LAKEVIEW_ORDER','/native','Reassembled members '+extra.join(', ')+' are not stored in the fragment');
  if(order.some(k=>!members.includes(k)&&!extra.includes(k))||members.some(k=>!order.includes(k)))add('LAKEVIEW_ORDER','/order','Member order must list exactly the retained and reassembled members');
  if(JSON.stringify(order.filter(k=>members.includes(k)))!==JSON.stringify(members))add('LAKEVIEW_ORDER','/order','Member order disagrees with the retained member sequence');
  const needs=p.kind==='page'?[local?.elements.some(e=>lv(e)?.kind==='layout-item')&&'layout']:[doc.modules.some(m=>m.elements.some(e=>lv(e)?.kind==='dataset'))&&'datasets',doc.modules.some(m=>lv(m)?.kind==='page')&&'pages'];
  for(const key of needs)if(key&&!order.includes(key))add('LAKEVIEW_ORDER','/order','Member order omits '+key+', so its retained content would not be exported');
 }
 return out;
}
export function lakeviewRegistry(){return dashboardRegistry().register(lakeviewPackage,inspect);}
export function inspectLakeview(document:Document){return validateDocument(document,lakeviewRegistry());}
function requireValid(document:Document):void {
 const checked=inspectLakeview(document);if(!checked.valid)throw new UmfError('LAKEVIEW_DOCUMENT',JSON.stringify(checked.diagnostics.filter(d=>d.severity==='error')));
 if(document.vocabularies[LAKEVIEW_EXTENSION]?.version!=='0.1.0'||lv(document)?.kind!=='dashboard')throw new UmfError('LAKEVIEW_PAYLOAD','Expected umf.lakeview 0.1.0 and a document-level dashboard');
 if(checked.diagnostics.some(d=>d.code==='LAKEVIEW_REPRESENTATION'))throw new UmfError('LAKEVIEW_EXPORT','Unknown representation fields cannot be discarded');
}
const assemble=(p:{native:ObjectTree;order:string[]},parts:Record<string,NativeJson>):NativeJson=>({kind:'object',members:Object.fromEntries(p.order.map(k=>[k,Object.hasOwn(parts,k)?parts[k]!:p.native.members[k]!]))});
const page=(module:Document['modules'][number]):NativeJson=>assemble(lv(module),{layout:{kind:'array',items:module.elements.filter(e=>lv(e)?.kind==='layout-item').map(e=>lv(e).native)}});
function dashboard(document:Document):NativeJson{
 const datasets=document.modules.filter(m=>lv(m)?.kind==='data').flatMap(m=>m.elements.filter(e=>lv(e)?.kind==='dataset').map(e=>lv(e).native));
 return assemble(lv(document),{datasets:{kind:'array',items:datasets},pages:{kind:'array',items:document.modules.filter(m=>lv(m)?.kind==='page').map(page)}});
}
/** Splits a .lvdash.json by identity, retains it exactly and projects it to umf.dashboard with a loss report. */
export function importLakeviewDashboard(text:string,options:{id:string;title?:string;namespace?:string}):LakeviewImport{
 const tree=parseNativeJson(text),view=JSON.parse(text);
 if(tree.kind!=='object')throw new UmfError('LAKEVIEW_NATIVE','Expected a Lakeview dashboard JSON object');
 const list=(key:string)=>{const n=tree.members[key];if(n!==undefined&&n.kind!=='array')throw new UmfError('LAKEVIEW_NATIVE',key+' must be an array');return n?.items??[];};
 const objects=(items:NativeJson[],what:string)=>items.map(n=>{if(n.kind!=='object')throw new UmfError('LAKEVIEW_NATIVE',what+' must be JSON objects');return n;});
 const strip=(n:ObjectTree,omit:string[]):ObjectTree=>({kind:'object',members:Object.fromEntries(Object.entries(n.members).filter(([k])=>!omit.includes(k)))});
 const unique=(taken:Set<string>,wanted:unknown,fallback:string)=>{const base=typeof wanted==='string'&&wanted?wanted:fallback;let id=base,n=1;while(taken.has(id))id=base+'_'+(++n);taken.add(id);return id;};
 const nativePages=objects(list('pages'),'Pages'),nativeDatasets=objects(list('datasets'),'Datasets');
 const moduleIds=new Set<string>(),datasetIds=new Set<string>();
 const pages=nativePages.map((n,i)=>{const items=new Set<string>(),layout=n.members.layout;if(layout!==undefined&&layout.kind!=='array')throw new UmfError('LAKEVIEW_NATIVE','Page layout must be an array');const nativeItems=objects(layout?.items??[],'Layout items');return {id:unique(moduleIds,view.pages[i].name,'page_'+i),n,nativeItems,items:nativeItems.map((_,j)=>unique(items,view.pages[i].layout[j].widget?.name,'item_'+j))};});
 const data=unique(moduleIds,'data','data'),datasets=nativeDatasets.map((_,i)=>unique(datasetIds,view.datasets[i].name,'dataset_'+i));
 const namespace=options.namespace??'';
 const document:Document={umf:'0.1.0',id:options.id,vocabularies:{[DASHBOARD_EXTENSION]:{version:'0.1.0'},[LAKEVIEW_EXTENSION]:{version:'0.1.0'}},
  extensions:{[LAKEVIEW_EXTENSION]:{kind:'dashboard',native:strip(tree,rebuilt.dashboard!),order:Object.keys(tree.members)} as unknown as Json},
  modules:[{id:data,namespace,extensions:{[LAKEVIEW_EXTENSION]:{kind:'data'}},elements:nativeDatasets.map((n,i)=>({id:datasets[i]!,extensions:{[LAKEVIEW_EXTENSION]:{kind:'dataset',native:n} as unknown as Json}}))},
   ...pages.map(p=>({id:p.id,namespace,extensions:{[LAKEVIEW_EXTENSION]:{kind:'page',native:strip(p.n,rebuilt.page!),order:Object.keys(p.n.members)} as unknown as Json},elements:p.nativeItems.map((n,j)=>({id:p.items[j]!,extensions:{[LAKEVIEW_EXTENSION]:{kind:'layout-item',native:n} as unknown as Json}}))}))]};
 const projection=projectLakeview(view,{data,datasets,pages:pages.map(p=>({id:p.id,items:p.items}))},{title:options.title??options.id});
 document.extensions![DASHBOARD_EXTENSION]=projection.root;
 const sources=new Map<string,string>();
 for(const module of document.modules){
  const payload=projection.modules.get(module.id);if(payload)module.extensions![DASHBOARD_EXTENSION]=payload;
  module.elements.forEach((element,j)=>{const value=projection.elements.get(elementKey(module.id,element.id));if(value)element.extensions[DASHBOARD_EXTENSION]=value;const pi=pages.findIndex(p=>p.id===module.id);sources.set(elementKey(module.id,element.id),pi<0?'/datasets/'+j:'/pages/'+pi+'/layout/'+j+'/widget');});
 }
 // A neutral item the profile rejects is omitted and reported; dependents are re-checked until the projection is valid.
 for(;;){
  const errors=inspectLakeview(document).diagnostics.filter(d=>d.severity==='error');if(!errors.length)break;
  let removed=false;
  for(const error of errors){
   const m=/^\/modules\/(\d+)\/elements\/(\d+)\/extensions\/umf\.dashboard(?:\/|$)/.exec(error.path),module=m?document.modules[Number(m[1])]:undefined,element=module?.elements[Number(m![2])];
   if(!element)throw new UmfError('LAKEVIEW_IMPORT','Projection produced an invalid dashboard declaration: '+JSON.stringify(errors));
   if(!element.extensions[DASHBOARD_EXTENSION])continue;
   delete element.extensions[DASHBOARD_EXTENSION];removed=true;
   projection.issues.push({path:sources.get(elementKey(module!.id,element.id))!,code:'LAKEVIEW_PROJECTION',classification:'unsupported',detail:error.code+': '+error.message+'; the neutral item is omitted',retainedInSource:true});
  }
  if(!removed)throw new UmfError('LAKEVIEW_IMPORT','Projection errors could not be isolated: '+JSON.stringify(errors));
 }
 return {document,issues:projection.issues};
}
export function exportLakeviewDashboard(document:Document):string{requireValid(document);return renderTree(dashboard(document));}
/** Rendered native JSON for the dashboard, one page module, or one dataset or layout-item element. */
export function getLakeviewNative(document:Document,module?:string,element?:string):string{
 requireValid(document);if(module===undefined)return renderTree(dashboard(document));
 const owner=document.modules.find(m=>m.id===module);if(!owner||!lv(owner))throw new UmfError('LAKEVIEW_REFERENCE','Missing Lakeview module');
 if(element===undefined){if(lv(owner).kind!=='page')throw new UmfError('LAKEVIEW_REFERENCE','Only page modules carry native content');return renderTree(page(owner));}
 const target=lv(owner.elements.find(e=>e.id===element));if(!target)throw new UmfError('LAKEVIEW_REFERENCE','Missing Lakeview element');return renderTree(cloneTree(target.native));
}
