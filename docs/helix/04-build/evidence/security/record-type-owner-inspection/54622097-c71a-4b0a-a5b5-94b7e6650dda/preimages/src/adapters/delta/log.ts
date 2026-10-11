import manifest from '../../../spec/extensions/delta-log/package.json';
import {Registry} from '../../registry/registry';
import {validateDocument} from '../../validation/document';
import {copyJson} from '../../model/json';
import {parseNativeJson,type NativeJson} from '../../model/native-json';
import {UmfError,type Document,type ExtensionPackage,type Diagnostic} from '../../model/types';
export const DELTA_LOG_EXTENSION='umf.delta.log';
export const deltaLogPackage=manifest as unknown as ExtensionPackage;
export function deltaLogRegistry(){return new Registry().register(deltaLogPackage);}
export function captureDeltaLog(text:string,options:{id:string}):Document{
 if(typeof text!=='string'||text.length>1000000)throw new UmfError('DELTA_LOG_LIMIT','Expected at most 1000000 UTF-16 code units');
 const doc:Document={umf:'0.1.0',id:options.id,vocabularies:{[DELTA_LOG_EXTENSION]:{version:'0.1.0'}},modules:[{id:'log',namespace:'',elements:[{id:'source',extensions:{[DELTA_LOG_EXTENSION]:{profile:'delta-jsonl-source',text}}}]}]};exportDeltaLog(doc);return doc;
}
export function exportDeltaLog(doc:Document):string{
 if(!validateDocument(doc,deltaLogRegistry()).valid)throw new UmfError('DELTA_LOG_DOCUMENT','Invalid source capture envelope');const p=doc.modules.find(m=>m.id==='log')?.elements.find(e=>e.id==='source')?.extensions[DELTA_LOG_EXTENSION];if(doc.vocabularies[DELTA_LOG_EXTENSION]?.version!=='0.1.0'||!p||typeof p!=='object'||Array.isArray(p))throw new UmfError('DELTA_LOG_PAYLOAD','Expected pinned log payload');if(Object.keys(p).some(k=>!['profile','text'].includes(k)))throw new UmfError('DELTA_LOG_REPRESENTATION','Unknown representation fields cannot be dropped from native export');if(typeof p.text!=='string'||p.text.length>1000000)throw new UmfError('DELTA_LOG_LIMIT','Expected at most 1000000 UTF-16 code units');return p.text;
}
export interface DeltaLogLine {line:number;start:number;end:number;terminator:''|'\n'|'\r\n';status:'parsed'|'blank'|'invalid';action?:string;node?:NativeJson}
/** Offsets are UTF-16 positions in source text; end excludes the line terminator. */
export function inspectDeltaLog(doc:Document){
 const text=exportDeltaLog(doc),lines:DeltaLogLine[]=[],diagnostics:Diagnostic[]=[{code:'DELTA_LOG_UNVERIFIED',path:'',severity:'warning',message:'Parsed action envelopes do not establish action semantics, transaction validity or reconciled state'}];let parsedAll=true,start=0;
 const add=(code:string,path:string,message:string,severity:'warning'|'error'='warning')=>diagnostics.push({code,path,message,severity});
 const known=new Set(['add','remove','metaData','protocol','txn','commitInfo','cdc','domainMetadata','sidecar','checkpointMetadata']);
 while(start<text.length){if(lines.length>=10000){parsedAll=false;add('DELTA_LOG_LINE_LIMIT','','Inspection stopped after 10000 lines; remaining source remains captured','error');break;}
  const newline=text.indexOf('\n',start),next=newline<0?text.length:newline+1,terminator:DeltaLogLine['terminator']=newline<0?'':text[newline-1]==='\r'?'\r\n':'\n',end=next-terminator.length,line=lines.length+1,at='/lines/'+(line-1),entry:DeltaLogLine={line,start,end,terminator,status:'invalid'},raw=text.slice(start,end);lines.push(entry);start=next;
  if(/^[\t\r ]*$/.test(raw)){entry.status='blank';add('DELTA_LOG_BLANK',at,'Blank line preserved; it is not an action');continue;}
  let node:NativeJson;try{node=parseNativeJson(raw);}catch(e){parsedAll=false;add('DELTA_LOG_JSON',at,(e as Error).message,'error');continue;}entry.node=node;
  if(node.kind!=='object'||Object.keys(node.members).length!==1){parsedAll=false;add('DELTA_LOG_ACTION_ENVELOPE',at,'Expected exactly one action key in an object','error');continue;}
  const action=Object.keys(node.members)[0]!;entry.status='parsed';entry.action=action;if(!known.has(action))add('DELTA_LOG_UNKNOWN_ACTION',at,'Unknown action retained without interpretation: '+action);
  else if(action!=='commitInfo'&&node.members[action]!.kind!=='object'){parsedAll=false;entry.status='invalid';add('DELTA_LOG_ACTION_VALUE',at,'Known action requires an object value','error');}
 }
 if(!lines.length)add('DELTA_LOG_EMPTY','','Empty source is preserved; it is not evidence of a valid commit');return {source:copyJson(doc) as unknown as Document,complete:false as const,parsedAll,lines,diagnostics};
}
