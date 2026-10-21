// SPDX-License-Identifier: MIT OR Apache-2.0
import {copyJson} from '../model/json';
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
}
export interface RowScopeDiagnostic {code:string;path:string;message:string}
export interface RowScopeResult {valid:boolean;source:unknown;policy?:TablePolicy;diagnostics:RowScopeDiagnostic[]}
const COMMANDS:readonly TableCommand[]=['select','insert','update','delete'];
const ptr=(s:string)=>s.replace(/~/g,'~0').replace(/\//g,'~1');
const isObject=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);

/** Normalize bounded row_scope authoring to the existing native `umf.tables` vocabulary. */
export function normalizeRowScope(input:unknown,context:RowScopeBindingContext):RowScopeResult{
 const diagnostics:RowScopeDiagnostic[]=[];
 const error=(code:string,path:string,message:string)=>diagnostics.push({code,path,message});
 let source:unknown;
 try{source=copyJson(input as never);}catch{source=input;error('ROW_SCOPE_JSON','/row_scope','Source must be JSON-compatible; original value was retained');}
 const wrapped=isObject(input)&&isObject(input.row_scope);
 const block=wrapped?input.row_scope as Record<string,unknown>:input;
 if(wrapped)for(const key of Object.keys(input as object))if(key!=='row_scope')error('ROW_SCOPE_UNKNOWN','/'+ptr(key),'Unknown source content is retained and not interpreted');
 if(!isObject(block)){error('ROW_SCOPE_SHAPE','/row_scope','Expected a row_scope object');return {valid:false,source,diagnostics};}
 const allowed=new Set(['owner_column','commands','via','batch','groups','open_reference_read']);
 for(const key of Object.keys(block))if(!allowed.has(key))error('ROW_SCOPE_UNKNOWN','/row_scope/'+ptr(key),'Unknown row_scope content is retained and not interpreted');
 const ownerName=block.owner_column;
 const ownerField=typeof ownerName==='string'?context.ownerColumns[ownerName]:undefined;
 if(!ownerField)error('ROW_SCOPE_OWNER','/row_scope/owner_column','Owner column must resolve to an exact current-Record Field binding');
 const list=(value:unknown,path:string):TableCommand[]=>{
  if(!Array.isArray(value)){error('ROW_SCOPE_COMMANDS',path,'Expected an explicit command list');return [];}
  const result:TableCommand[]=[];
  for(const[i,item]of value.entries())if(typeof item!=='string'||!COMMANDS.includes(item as TableCommand))error('ROW_SCOPE_COMMAND',path+'/'+i,'Unknown command');else if(result.includes(item as TableCommand))error('ROW_SCOPE_DUPLICATE',path+'/'+i,'Duplicate command');else result.push(item as TableCommand);
  return result;
 };
 const personCommands=list(block.commands,'/row_scope/commands');
 const batchCommands=list(block.batch,'/row_scope/batch');
 const viaRules:TableRowRule[]=[];
 if(block.via!==undefined){
  if(!Array.isArray(block.via))error('ROW_SCOPE_VIA','/row_scope/via','Expected a list of explicit via declarations');
  else for(const[i,item]of block.via.entries()){
   const path='/row_scope/via/'+i;
   if(!isObject(item)||typeof item.table!=='string'||typeof item.person_column!=='string'||typeof item.key_column!=='string'){error('ROW_SCOPE_VIA',path,'Via declaration requires table, person_column and key_column');continue;}
   for(const key of Object.keys(item))if(!['table','person_column','key_column'].includes(key))error('ROW_SCOPE_UNKNOWN',path+'/'+ptr(key),'Unknown via content is retained and not interpreted');
   const matches=context.via.filter(b=>b.name===item.table);
   if(matches.length!==1){error('ROW_SCOPE_VIA_BINDING',path+'/table','Via table must resolve to exactly one host-supplied binding');continue;}
   const binding=matches[0]!;
   if(item.person_column!==binding.personColumnName||item.key_column!==binding.keyColumnName){error('ROW_SCOPE_VIA_FIELDS',path,'Via field names do not match the exact host-supplied source/target pair');continue;}
   viaRules.push({kind:'related',record:binding.record,matches:[{source:binding.sourceField,target:binding.keyField}],rule:{kind:'owner',field:binding.personField}});
  }
 }
 const personBase:TableRowRule=viaRules.length?{kind:'any',rules:[...(ownerField?[{kind:'owner',field:ownerField} as const]:[]),...viaRules]}:ownerField?{kind:'owner',field:ownerField}:{kind:'deny'};
 const isOpen=block.open_reference_read===true;
 if(block.open_reference_read!==undefined&&typeof block.open_reference_read!=='boolean')error('ROW_SCOPE_OPEN_READ','/row_scope/open_reference_read','Expected a boolean');
 if(isOpen&&!context.openReferenceRead)error('ROW_SCOPE_OPEN_READ_BINDING','/row_scope/open_reference_read','Open read requires an explicit host declaration that this is a public reference table');
 const person:Record<TableCommand,TableRowRule>={select:personBase,insert:personBase,update:personBase,delete:personBase};
 if(isOpen&&context.openReferenceRead&&personCommands.includes('select'))person.select={kind:'allow'};
 for(const command of COMMANDS)if(!personCommands.includes(command))person[command]={kind:'deny'};
 const batch:Record<TableCommand,TableRowRule>={select:{kind:'deny'},insert:{kind:'deny'},update:{kind:'deny'},delete:{kind:'deny'}};
 for(const command of batchCommands)batch[command]={kind:'allow'};
 if(block.groups!==undefined){
  if(!Array.isArray(block.groups))error('ROW_SCOPE_GROUPS','/row_scope/groups','Expected a list of named group grants');
  else for(const[i,item]of block.groups.entries()){
   const path='/row_scope/groups/'+i;
   if(!isObject(item)||typeof item.name!=='string'||!Array.isArray(item.commands)){error('ROW_SCOPE_GROUP',path,'Group grant requires name and commands');continue;}
   for(const key of Object.keys(item))if(!['name','commands'].includes(key))error('ROW_SCOPE_UNKNOWN',path+'/'+ptr(key),'Unknown group content is retained and not interpreted');
   const role=context.groups?.[item.name];if(!role){error('ROW_SCOPE_GROUP_ALIAS',path+'/name','Group must resolve through a trusted host alias');continue;}
   const selected=list(item.commands,path+'/commands');for(const command of selected)person[command]={kind:'any',rules:[person[command],{kind:'memberOfRole',role}]};
  }
 }
 const valid=diagnostics.length===0;
 return valid?{valid,source,policy:{mode:'native-rls',person,batch},diagnostics}:{valid,source,diagnostics};
}
