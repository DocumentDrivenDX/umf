import {getLinkmlDocumentNode,inspectLinkmlDocument} from './index';
import {copyJson} from '../../model/json';
import {pointer,UmfError,type Document,type Diagnostic} from '../../model/types';
import type {NativeJson} from '../../model/native-json';
export interface LinkmlClassSlotsReport {
 source:Document;className:string;scope:'document';status:'resolved'|'blocked';complete:false;
 ancestors:string[];slots:{name:string;declarations:{className:string;path:string;kind:'slot'|'attribute'}[]}[];diagnostics:Diagnostic[];
}
/** Local class-slot membership only; import merge and induced slot values are separate operations. */
export function inspectLinkmlClassSlots(document:Document,className:string):LinkmlClassSlotsReport {
 if(typeof className!=='string'||!className.length||className.length>4096)throw new UmfError('LINKML_CLASS_NAME','Expected bounded class name');
 const source=copyJson(document) as unknown as Document;
 const report:LinkmlClassSlotsReport={source,className,scope:'document',status:'resolved',complete:false,ancestors:[],slots:[],diagnostics:[]};
 const fail=(path:string,message:string)=>{report.status='blocked';report.diagnostics.push({code:'LINKML_CLASS_SLOTS',path,message,severity:'error'});};
 let root:NativeJson;
 try{root=getLinkmlDocumentNode(source,'');const checked=inspectLinkmlDocument(source);report.diagnostics.push(...checked.diagnostics);if(checked.diagnostics.some(d=>['LINKML_VERSION','LINKML_REPRESENTATION'].includes(d.code))){fail('','Uninterpreted version or representation');return report;}}
 catch(e){fail('',String(e));return report;}
 if(root.kind!=='object'||root.members.classes?.kind!=='object'){fail('/classes','Expected local class dictionary');return report;}
 const classes=root.members.classes.members;
 const own=(key:string)=>Object.hasOwn(classes,key)?classes[key]:undefined;
 const names=(value:NativeJson|undefined,path:string):string[]=>{
  if(value===undefined)return [];
  if(value.kind!=='array'){fail(path,'Expected explicit name array; native singleton normalization is not applied');return [];}
  const result:string[]=[];for(const [i,v] of value.items.entries()){if(v.kind!=='string'||!v.value.length)fail(path+'/'+i,'Expected nonempty name');else result.push(v.value);}return result;
 };
 const definitions=new Map<string,Extract<NativeJson,{kind:'object'}>>();
 const todo=[className],discovered=new Set([className]);report.ancestors.push(className);
 // Match SchemaView._closure discovery order: append parents in order, process a LIFO stack.
 while(todo.length){const name=todo.pop()!,path='/classes/'+pointer(name),c=own(name);
  if(!c||c.kind!=='object'){fail(path,'Class is absent or not an object in this document');continue;}
  if(c.members.name&&(c.members.name.kind!=='string'||c.members.name.value!==name)){fail(path+'/name','Dictionary key and explicit class name disagree');continue;}
  definitions.set(name,c);const parents=names(c.members.mixins,path+'/mixins');
  if(c.members.is_a){if(c.members.is_a.kind!=='string'||!c.members.is_a.value)fail(path+'/is_a','Expected nonempty parent name');else parents.push(c.members.is_a.value);}
  for(const p of parents)if(!discovered.has(p)){discovered.add(p);report.ancestors.push(p);todo.push(p);}
 }
 const slots=new Map<string,LinkmlClassSlotsReport['slots'][number]>();
 const add=(name:string,owner:string,path:string,kind:'slot'|'attribute')=>{let s=slots.get(name);if(!s){s={name,declarations:[]};slots.set(name,s);}s.declarations.push({className:owner,path,kind});};
 for(const name of report.ancestors){const c=definitions.get(name);if(!c)continue;const path='/classes/'+pointer(name);
  names(c.members.slots,path+'/slots').forEach((s,i)=>add(s,name,path+'/slots/'+i,'slot'));
  const attrs=c.members.attributes;if(attrs){if(attrs.kind!=='object')fail(path+'/attributes','Expected attribute dictionary');else for(const [s,v] of Object.entries(attrs.members)){if(!s||v.kind!=='object'&&v.kind!=='null')fail(path+'/attributes/'+pointer(s),'Expected named attribute object or compact null');else if(v.kind==='object'&&v.members.name&&(v.members.name.kind!=='string'||v.members.name.value!==s))fail(path+'/attributes/'+pointer(s)+'/name','Attribute key and explicit name disagree');else add(s,name,path+'/attributes/'+pointer(s),'attribute');}}
 }
 if(report.status==='resolved')report.slots=[...slots.values()];
 report.diagnostics.push({code:'LINKML_CLASS_CONTEXT',path:'',severity:'warning',message:'Document-local class-slot membership only, matching imports:false. Imports are not merged; cycles do not imply valid inheritance. Slot definitions, slot_usage, constraints, defaults and effective values are not induced. Source and declaration occurrences remain preserved.'});
 return report;
}
