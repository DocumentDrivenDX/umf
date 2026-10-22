import {inspectLinkmlImportContext,type LinkmlImportContext} from './imports';
import {getLinkmlDocumentNode,importLinkmlDocument} from './index';
import {copyJson} from '../../model/json';
import {renderTree,type NativeJson} from '../../model/native-json';
import {pointer,UmfError,type Document,type Diagnostic} from '../../model/types';
export const LINKML_MERGE_COLLECTIONS=['prefixes','classes','slots','enums','subsets','types'] as const;
export interface LinkmlImportMergeReport {
 context:LinkmlImportContext;mode:'view'|'merge-imports';status:'candidate'|'blocked';complete:false;
 closure:string[];selections:{collection:string;name:string;winner:string;shadowed:string[]}[];
 candidate?:Document;diagnostics:Diagnostic[];
}
/** Materialize supplied declarations using an explicitly selected native precedence policy. */
export function proposeLinkmlImportMerge(input:LinkmlImportContext,options:{mode:'view'|'merge-imports'}):LinkmlImportMergeReport {
 if(!options||!['view','merge-imports'].includes(options.mode))throw new UmfError('LINKML_MERGE_MODE','Select view or merge-imports precedence explicitly');
 const graph=inspectLinkmlImportContext(input),r:LinkmlImportMergeReport={context:graph.context,mode:options.mode,status:'blocked',complete:false,closure:[],selections:[],diagnostics:graph.diagnostics.filter(d=>d.code!=='LINKML_IMPORT_CONTEXT')};
 if(graph.status==='blocked')return r;
 const fail=(path:string,message:string)=>r.diagnostics.push({code:'LINKML_MERGE',path,message,severity:'error'});
 const byKey=new Map(graph.context.schemas.map(s=>[s.key,s.document])),edges=new Map<string,string[]>();
 for(const edge of graph.edges){const list=edges.get(edge.from)??[];list.push(edge.target!);edges.set(edge.from,list);}
 const todo=[graph.context.entry],visited=new Set<string>(),reverse:string[]=[];
 while(todo.length){const key=todo.pop()!;if(!visited.has(key))for(const target of edges.get(key)??[])if(target!==key)todo.push(target);reverse.push(key);visited.add(key);}
 r.closure=[...new Set(reverse.reverse())];
 const roots=new Map<string,Extract<NativeJson,{kind:'object'}>>();
 for(const key of r.closure){const root=getLinkmlDocumentNode(byKey.get(key)!,'') as Extract<NativeJson,{kind:'object'}>;roots.set(key,root);if(root.members.id?.kind!=='string')fail('/'+pointer(key)+'/id','Schema id must be a string for native from_schema provenance');for(const collection of LINKML_MERGE_COLLECTIONS)if(root.members[collection]&&root.members[collection]!.kind!=='object')fail('/'+pointer(key)+'/'+collection,'Expected explicit declaration dictionary');}
 if(r.diagnostics.some(d=>d.severity==='error'))return r;
 const entry=roots.get(graph.context.entry)!,candidate=copyJson(entry) as unknown as Extract<NativeJson,{kind:'object'}>;
 const order=options.mode==='view'?r.closure:[graph.context.entry,...r.closure.filter(k=>k!==graph.context.entry)];
 for(const collection of LINKML_MERGE_COLLECTIONS){const selected=new Map<string,{key:string;value:NativeJson;seen:string[]}>();let present=false;
  for(const key of order){const root=roots.get(key)!,decls=root.members[collection];if(!decls)continue;present=true;if(decls.kind!=='object')continue;
   for(const [name,value] of Object.entries(decls.members)){const previous=selected.get(name);if(!previous)selected.set(name,{key,value,seen:[key]});else{previous.seen.push(key);if(options.mode==='view'){previous.key=key;previous.value=value;}}}
  }
  if(!present)continue;const members:Record<string,NativeJson>=Object.create(null);
  for(const [name,selection] of selected){const key=selection.key,origin=roots.get(key)!.members.id!,path='/'+pointer(key)+'/'+collection+'/'+pointer(name);let value=copyJson(selection.value) as unknown as NativeJson;
   if(collection!=='prefixes'){
    if(value.kind==='null')value={kind:'object',members:{}};
    if(value.kind!=='object'){fail(path,'Expected definition object or compact null');continue;}
    value.members.from_schema=copyJson(origin) as unknown as NativeJson;
    if(collection==='classes'&&value.members.attributes){const attrs=value.members.attributes;if(attrs.kind!=='object'){fail(path+'/attributes','Expected attribute dictionary');continue;}for(const [attribute,v] of Object.entries(attrs.members)){if(v.kind==='null')attrs.members[attribute]={kind:'object',members:{from_schema:copyJson(origin) as unknown as NativeJson}};else if(v.kind==='object')v.members.from_schema=copyJson(origin) as unknown as NativeJson;else fail(path+'/attributes/'+pointer(attribute),'Expected attribute object or compact null');}}
   }
   Object.defineProperty(members,name,{value,enumerable:true,configurable:true,writable:true});r.selections.push({collection,name,winner:key,shadowed:selection.seen.filter(k=>k!==key)});
  }
  candidate.members[collection]={kind:'object',members};
 }
 if(r.diagnostics.some(d=>d.severity==='error')){r.selections=[];return r;}
 candidate.members.imports={kind:'array',items:[]};
 r.candidate=importLinkmlDocument(renderTree(candidate)+'\n',{id:byKey.get(graph.context.entry)!.id,format:'json'});r.status='candidate';
 r.diagnostics.push({code:'LINKML_MERGE_CONTEXT',path:'',severity:'warning',message:'Candidate uses explicit supplied bindings and selected native dictionary precedence. Imports are removed; native from_schema provenance is injected. Entry schema metadata stays authoritative; imported top-level metadata, shadowed declarations and all original layouts remain in context. No URI retrieval, instance validation, generator equivalence or arbitrary importer-scoped native equivalence is asserted.'});return r;
}
