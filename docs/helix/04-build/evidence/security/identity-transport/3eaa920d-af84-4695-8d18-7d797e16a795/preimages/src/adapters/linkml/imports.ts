import {getLinkmlDocumentNode,inspectLinkmlDocument} from './index';
import {copyJson} from '../../model/json';
import {UmfError,type Document,type Diagnostic} from '../../model/types';
export interface LinkmlImportContext {
 entry:string;schemas:{key:string;document:Document}[];bindings:{from:string;import:string;target:string}[];
}
export interface LinkmlImportReport {
 context:LinkmlImportContext;status:'resolved'|'blocked';complete:false;nodes:string[];
 edges:{from:string;import:string;path:string;target?:string}[];diagnostics:Diagnostic[];
}
/** Traverse only caller-supplied import bindings. Does not guess retrieval paths or merge declarations. */
export function inspectLinkmlImportContext(input:LinkmlImportContext):LinkmlImportReport {
 const bounded=(s:unknown):s is string=>typeof s==='string'&&s.length>0&&s.length<=4096;
 if(!input||!bounded(input.entry)||!Array.isArray(input.schemas)||input.schemas.length<1||input.schemas.length>128||!Array.isArray(input.bindings)||input.bindings.length>4096||input.schemas.some(s=>!s||!bounded(s.key))||input.bindings.some(b=>!b||![b.from,b.import,b.target].every(bounded)))throw new UmfError('LINKML_IMPORT_CONTEXT','Expected entry, 1–128 keyed schemas and at most 4096 explicit bounded bindings');
 const context=copyJson(input) as unknown as LinkmlImportContext,report:LinkmlImportReport={context,status:'resolved',complete:false,nodes:[],edges:[],diagnostics:[]};
 const error=(code:string,path:string,message:string)=>{report.status='blocked';report.diagnostics.push({code,path,message,severity:'error'});};
 const schemas=new Map<string,{document:Document;index:number}>(),bindings=new Map<string,Map<string,string>>();
 for(const [i,s] of context.schemas.entries()){if(schemas.has(s.key))error('LINKML_IMPORT_DUPLICATE','/schemas/'+i,'Duplicate resource key '+JSON.stringify(s.key));else schemas.set(s.key,{document:s.document,index:i});}
 for(const [i,s] of context.schemas.entries()){try{getLinkmlDocumentNode(s.document,'');}catch(e){error('LINKML_IMPORT_DOCUMENT','/schemas/'+i+'/document',String(e));}}
 for(const [i,b] of context.bindings.entries()){
  if(!schemas.has(b.from)||!schemas.has(b.target))error('LINKML_IMPORT_RESOURCE','/bindings/'+i,'Binding source or target is not supplied');
  let mapping=bindings.get(b.from);if(!mapping){mapping=new Map();bindings.set(b.from,mapping);}
  if(mapping.has(b.import))error('LINKML_IMPORT_DUPLICATE','/bindings/'+i,'Duplicate binding for the same importer and literal import');else mapping.set(b.import,b.target);
 }
 if(!schemas.has(context.entry))error('LINKML_IMPORT_ENTRY','/entry','Entry resource is not supplied');
 if(report.status==='blocked')return report;
 const queue=[context.entry],visited=new Set<string>();
 for(let i=0;i<queue.length;i++){
  const key=queue[i]!;if(visited.has(key))continue;visited.add(key);report.nodes.push(key);
  const resource=schemas.get(key)!,prefix='/schemas/'+resource.index+'/document';
  let root;
  try{root=getLinkmlDocumentNode(resource.document,'');const checked=inspectLinkmlDocument(resource.document);for(const d of checked.diagnostics)report.diagnostics.push({...d,path:prefix+d.path});if(checked.diagnostics.some(d=>d.code==='LINKML_VERSION'||d.code==='LINKML_REPRESENTATION')){error('LINKML_IMPORT_VERSION',prefix,'Uninterpreted metamodel/representation cannot supply imports');continue;}}
  catch(e){error('LINKML_IMPORT_DOCUMENT',prefix,String(e));continue;}
  if(root.kind!=='object'){error('LINKML_IMPORT_DOCUMENT',prefix,'Expected schema object');continue;}
  const imports=root.members.imports;if(!imports)continue;
  if(imports.kind!=='array'){error('LINKML_IMPORT_SHAPE',prefix+'/imports','Explicit import list required; native singleton normalization is not performed');continue;}
  for(const [j,item] of imports.items.entries()){
   const path='/imports/'+j;if(item.kind!=='string'||!bounded(item.value)){error('LINKML_IMPORT_SHAPE',prefix+path,'Expected bounded literal import string');continue;}
   const target=bindings.get(key)?.get(item.value),edge={from:key,import:item.value,path,...(target===undefined?{}:{target})};report.edges.push(edge);
   if(target===undefined){error('LINKML_IMPORT_UNRESOLVED',prefix+path,'No supplied binding for '+JSON.stringify(item.value));continue;}
   if(!visited.has(target))queue.push(target);
  }
 }
 report.diagnostics.push({code:'LINKML_IMPORT_CONTEXT',path:'',severity:'warning',message:'Reachability under explicit bindings only. Declared edge occurrences/order retained; no URI/CURIE resolution, merge precedence, induced schema, cycle legality or instance validation is inferred.'});
 return report;
}
