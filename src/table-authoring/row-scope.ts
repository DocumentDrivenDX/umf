// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson} from '../model/json';
import type {Json,Document} from '../model/types';
import type {TableCommand,TablePolicy,TableRef,TableRowRule} from '../extensions/tables';

export interface RowScopeViaBinding {
  /** Name used in source row_scope.via[].table. */
  name:string;
  /** Exact UMF table Record and relationship path from the protected Record. */
  record:TableRef;
  /** Exact source spelling bound by the host to these UMF Fields. */
  personColumnName:string;
  keyColumnName:string;
  /** Explicit source/current-row to related-row equality pair. */
  sourceField:TableRef;
  keyField:TableRef;
  /** Person identity field on the related association Record. */
  personField:TableRef;
}
export interface RowScopeBindingContext {
  record:TableRef;
  ownerColumns:Readonly<Record<string,TableRef>>;
  via:readonly RowScopeViaBinding[];
  /** Source group name to preapproved native-role alias. */
  groups?:Readonly<Record<string,string>>;
  /** Explicitly identifies a public reference table; open read requires this. */
  openReferenceRead?:boolean;
  /** Run canonical lifecycle/dependency admission against the host document. */
  admitPolicy:(policy:TablePolicy)=>readonly RowScopeDiagnostic[];
  lifecycleDocument?:Document;
  tableId?:string;
  deploymentConfiguration?:unknown;
}
export interface RowScopeDiagnostic {code:string;path:string;message:string}
export interface RowScopeResult {valid:boolean;source?:Json;policy?:TablePolicy;diagnostics:RowScopeDiagnostic[];sourceToOutput:Record<string,string[]>}
const COMMANDS:readonly TableCommand[]=['select','insert','update','delete'];
const ptr=(s:string)=>s.replace(/~/g,'~0').replace(/\//g,'~1');
const isObject=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);

/** Normalize bounded row_scope authoring to the existing native `umf.tables` vocabulary. */
export function normalizeRowScope(input:unknown,context:RowScopeBindingContext):RowScopeResult{
 const diagnostics:RowScopeDiagnostic[]=[];
 const sourceToOutput:Record<string,string[]>={};
 const error=(code:string,path:string,message:string)=>diagnostics.push({code,path,message});
 let source:Json;
 try{source=copyJson(input);}catch{
  error('ROW_SCOPE_JSON','/row_scope','Source is not faithfully JSON-compatible; no source content was read or interpreted');
  return {valid:false,diagnostics,sourceToOutput};
 }
 const wrapped=isObject(source)&&isObject(source.row_scope);
 const block=wrapped?(source as Record<string,Json>).row_scope:source;
 if(wrapped)for(const key of Object.keys(source as object))if(key!=='row_scope')error('ROW_SCOPE_UNKNOWN','/'+ptr(key),'Unknown source content is retained and not interpreted');
 if(!isObject(block)){error('ROW_SCOPE_SHAPE','/row_scope','Expected a row_scope object');return {valid:false,source,diagnostics,sourceToOutput};}
 const base=wrapped?'/row_scope':'';
 const allowed=new Set(['owner_column','commands','via','batch','groups','open_reference_read']);
 for(const key of Object.keys(block))if(!allowed.has(key))error('ROW_SCOPE_UNKNOWN',base+'/'+ptr(key),'Unknown row_scope content is retained and not interpreted');
 const origins:{from:string;rule:TableRowRule}[]=[];
 const map=(from:string,to:string)=>{const targets=sourceToOutput[from]??=[];if(!targets.includes(to))targets.push(to);};
 const ownerName=block.owner_column;
 const ownerField=typeof ownerName==='string'?context.ownerColumns[ownerName]:undefined;
 if(ownerName!==undefined&&!ownerField)error('ROW_SCOPE_OWNER',base+'/owner_column','Owner column must resolve to an exact current-Record Field binding');
 const ownerRule:TableRowRule|undefined=ownerField?{kind:'owner',field:ownerField}:undefined;
 if(typeof ownerName==='string'&&ownerRule)origins.push({from:base+'/owner_column',rule:ownerRule});
 const list=(value:Json|undefined,path:string,missingMeansEmpty=false):TableCommand[]=>{
  if(value===undefined&&missingMeansEmpty)return [];
  if(!Array.isArray(value)){error('ROW_SCOPE_COMMANDS',path,'Expected an explicit command list');return [];}
  const result:TableCommand[]=[];
  for(const[i,item]of value.entries())if(typeof item!=='string'||!COMMANDS.includes(item as TableCommand))error('ROW_SCOPE_COMMAND',path+'/'+i,'Unknown command');else if(result.includes(item as TableCommand))error('ROW_SCOPE_DUPLICATE',path+'/'+i,'Duplicate command');else result.push(item as TableCommand);
  return result;
 };
 const personCommands=list(block.commands,base+'/commands',true);
 const batchCommands=list(block.batch,base+'/batch',true);
 const viaRules:{sourcePath:string;rule:TableRowRule}[]=[];
 if(block.via!==undefined){
  if(!Array.isArray(block.via))error('ROW_SCOPE_VIA',base+'/via','Expected a list of explicit via declarations');
  else for(const[i,item]of block.via.entries()){
   const path=base+'/via/'+i;
   if(!isObject(item)||typeof item.table!=='string'||typeof item.person_column!=='string'||typeof item.key_column!=='string'){error('ROW_SCOPE_VIA',path,'Via declaration requires table, person_column and key_column');continue;}
   for(const key of Object.keys(item))if(!['table','person_column','key_column'].includes(key))error('ROW_SCOPE_UNKNOWN',path+'/'+ptr(key),'Unknown via content is retained and not interpreted');
   const matches=context.via.filter(b=>b.name===item.table);
   if(matches.length!==1){error('ROW_SCOPE_VIA_BINDING',path+'/table','Via table must resolve to exactly one host-supplied binding');continue;}
   const binding=matches[0]!;
   if(item.person_column!==binding.personColumnName||item.key_column!==binding.keyColumnName){error('ROW_SCOPE_VIA_FIELDS',path,'Via field names do not match the exact host-supplied source/target pair');continue;}
   viaRules.push({sourcePath:path,rule:{kind:'related',record:binding.record,matches:[{source:binding.sourceField,target:binding.keyField}],rule:{kind:'owner',field:binding.personField}}});
  }
 }
 const personBase:TableRowRule=viaRules.length?{kind:'any',rules:[...(ownerRule?[ownerRule]:[]),...viaRules.map(v=>v.rule)]}:ownerRule??{kind:'deny'};
 const isOpen=block.open_reference_read===true;
 if(block.open_reference_read!==undefined&&typeof block.open_reference_read!=='boolean')error('ROW_SCOPE_OPEN_READ',base+'/open_reference_read','Expected a boolean');
 if(isOpen&&!context.openReferenceRead)error('ROW_SCOPE_OPEN_READ_BINDING',base+'/open_reference_read','Open read requires an explicit host declaration that this is a public reference table');
 const person:Record<TableCommand,TableRowRule>={select:personBase,insert:personBase,update:personBase,delete:personBase};
 if(isOpen&&context.openReferenceRead&&personCommands.includes('select'))person.select={kind:'allow'};
 for(const command of COMMANDS)if(!personCommands.includes(command))person[command]={kind:'deny'};
 for(const command of personCommands){const index=(block.commands as Json[]).findIndex(value=>value===command);map(base+'/commands/'+index,'/policy/person/'+command);}
 for(const command of batchCommands){const index=(block.batch as Json[]).findIndex(value=>value===command);map(base+'/batch/'+index,'/policy/batch/'+command);}
 const batch:Record<TableCommand,TableRowRule>={select:{kind:'deny'},insert:{kind:'deny'},update:{kind:'deny'},delete:{kind:'deny'}};
 for(const command of batchCommands)batch[command]={kind:'allow'};
 if(block.groups!==undefined){
  if(!Array.isArray(block.groups))error('ROW_SCOPE_GROUPS',base+'/groups','Expected a list of named group grants');
  else for(const[i,item]of block.groups.entries()){
   const path=base+'/groups/'+i;
   if(!isObject(item)||typeof item.name!=='string'||!Array.isArray(item.commands)){error('ROW_SCOPE_GROUP',path,'Group grant requires name and commands');continue;}
   for(const key of Object.keys(item))if(!['name','commands'].includes(key))error('ROW_SCOPE_UNKNOWN',path+'/'+ptr(key),'Unknown group content is retained and not interpreted');
   const role=context.groups?.[item.name];if(!role){error('ROW_SCOPE_GROUP_ALIAS',path+'/name','Group must resolve through a trusted host alias');continue;}
   const selected=list(item.commands,path+'/commands');
   for(const command of selected){
    if(!personCommands.includes(command)){error('ROW_SCOPE_GROUP_COMMAND',path+'/commands','Group grant cannot add a command omitted from the person command subset');continue;}
    const roleRule:TableRowRule={kind:'memberOfRole',role};person[command]={kind:'any',rules:[person[command],roleRule]};
    const commandIndex=(item.commands as Json[]).findIndex(value=>value===command);origins.push({from:path+'/commands/'+commandIndex,rule:roleRule});
   }
  }
 }
 for(const command of personCommands){
  if(ownerRule)origins.push({from:base+'/owner_column',rule:ownerRule});
  for(const item of viaRules)origins.push({from:item.sourcePath,rule:item.rule});
 }
 if(isOpen&&context.openReferenceRead&&personCommands.includes('select'))map(base+'/open_reference_read','/policy/person/select');
 const locate=(rule:TableRowRule,target:TableRowRule,path:string,found:string[])=>{if(rule===target){found.push(path);return;}if((rule.kind==='any'||rule.kind==='all')&&rule.rules)for(const[i,child]of rule.rules.entries())locate(child,target,path+'/rules/'+i,found);};
 const policy:TablePolicy={mode:'native-rls',person,batch};
 for(const origin of origins)for(const command of COMMANDS){if(!personCommands.includes(command))continue;const found:string[]=[];locate(person[command],origin.rule,'/policy/person/'+command,found);for(const path of found)map(origin.from,path);}
 if(diagnostics.length===0){
  diagnostics.push(...context.admitPolicy(policy));
 }
 const valid=diagnostics.length===0;
 return valid?{valid,source,policy,diagnostics,sourceToOutput}:{valid,source,diagnostics,sourceToOutput};
}
