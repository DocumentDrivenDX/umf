// SPDX-License-Identifier: MIT OR Apache-2.0
import operationSchema from '../../../spec/extensions/tables/operation.schema.json';
import tableSchema from '../../../spec/extensions/tables/schema.json';
import {createValidator} from '../../validation/schema';
import {canonicalSchemaJson} from '../../model/schema-literals';
import {domain,inspectUnknown,refKey,TableContext} from './context';
import {inspectStoredLiteral} from './columns';
import type {TableDeclaration,TableLifecyclePayload,TableOperation,TableOperationPredicate,TableOperationValue,TableRef,TableNativeType} from './types';

const validator=createValidator();validator.addSchema(tableSchema);
const validOperation=validator.compile(operationSchema);
const definitions={...tableSchema.$defs,...operationSchema.$defs};
/** Declaration/type admission only. Weft owns lowering; hosts own effects/replay. */
export function inspectOperations(payload:TableLifecyclePayload,ctx:TableContext):void {
 const admitted:TableOperation[]=[];
 for(const[i,raw]of payload.commands.entries()){
  const path=ctx.path+'/commands/'+i;
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||(raw as Record<string,unknown>).version!=='umf.table-operation/0.1'){
   ctx.add('TABLES_COMMAND_PENDING',path,'Unknown operation version is retained without interpretation',true);continue;
  }
  if(!validOperation(raw)){ctx.add('TABLES_OPERATION_SHAPE',path,'Invalid declared operation shape');continue;}
  inspectUnknown(raw,operationSchema,definitions,ctx,path);
  const command=raw as unknown as TableOperation;admitted.push(command);
  inspectOperation(command,payload,ctx,path);
 }
 ctx.unique(admitted,c=>c.id,ctx.path+'/commands','operation ID');
}
function inspectOperation(command:TableOperation,payload:TableLifecyclePayload,ctx:TableContext,path:string):void {
 if(command.body.kind==='query'){inspectQuery(command,ctx,path);return;}
 const tableId=command.body.table;
 const table=payload.tables.find(t=>t.id===tableId);
 if(!table){ctx.add('TABLES_OPERATION_TABLE',path+'/body/table','Operation requires a table in its owning module');return;}
 const sourceId=command.body.kind==='insertFrom'?command.body.source.table:undefined;
 const sourceTable=payload.tables.find(t=>t.id===sourceId);
 if(command.body.kind==='insertFrom'&&!sourceTable){ctx.add('TABLES_OPERATION_TABLE',path+'/body/source/table','Insert source requires an original table in this module');return;}
 const parameters=new Map(command.parameters.map(p=>[p.id,p]));
 ctx.unique(command.parameters,p=>p.id,path+'/parameters','operation parameter');
 for(const[i,p]of command.parameters.entries()){
  const field=ctx.field(p.field,path+'/parameters/'+i+'/field');
  if(p.field.module!==ctx.module.id||!payload.tables.some(t=>t.columns.some(c=>refKey(c.field)===refKey(p.field))))ctx.add('TABLES_OPERATION_PARAMETER',path+'/parameters/'+i+'/field','Parameter domain must be a declared column of the owning module');
  if(field&&(Object.keys(field.extensions).length||field.semanticTypes?.length))ctx.add('TABLES_OPERATION_MEANING',path+'/parameters/'+i+'/field','Parameter meaning needs a separately qualified interpreter',true);
 }
 const used=new Set<string>();
 const field=(ref:TableRef,p:string,scope=table)=>{
  const column=scope.columns.find(c=>refKey(c.field)===refKey(ref));
  if(!column){ctx.add('TABLES_OPERATION_FIELD',p,'Field must belong to the operation table');return;}
  const element=ctx.field(ref,p);return element?{column,element}:undefined;
 };
 const value=(v:TableOperationValue,target:TableRef,p:string,scope=table,assignment=false):void=>{
  const selected=field(target,p,scope);if(!selected)return;
  if(v.kind==='currentTimestamp'){if(selected.column.nativeType.kind!=='timestamptz'||selected.element.scalarType!=='timestamp')ctx.add('TABLES_OPERATION_DOMAIN',p,'Transaction timestamp requires explicit instant storage');return;}
  if(v.kind==='currentPrincipal'){if(selected.element.scalarType!=='string'||!['text','varchar'].includes(selected.column.nativeType.kind))ctx.add('TABLES_OPERATION_DOMAIN',p,'Current principal requires native text storage');return;}
  if(v.kind==='sourceField'){
   const origin=assignment&&sourceTable?field(v.field,p+'/field',sourceTable):undefined;
   if(!origin){ctx.add('TABLES_OPERATION_SOURCE',p,'Source fields are available only in insert-from assignments');return;}
   if(origin.element.scalarType!==selected.element.scalarType||origin.element.cardinality!==selected.element.cardinality||nativeDomain(origin.column.nativeType)!==nativeDomain(selected.column.nativeType)||(origin.element.nullability!=='required'&&selected.element.nullability==='required')){ctx.add('TABLES_OPERATION_DOMAIN',p,'Source copy requires compatible availability and exact native capacity');return;}
   if(origin.element.allowedValues?.length){
    for(const literal of origin.element.allowedValues)if(literal!==null||origin.element.nullability!=='required')inspectStoredLiteral(selected.column,selected.element,literal,ctx,p+'/field');
   }else{
    if(selected.element.allowedValues!==undefined)ctx.add('TABLES_OPERATION_DOMAIN',p,'Source domain does not prove target membership');
    for(const[key,facet]of Object.entries(selected.element.facets??{}))if(canonicalSchemaJson(facet)!==canonicalSchemaJson(origin.element.facets?.[key]??null))ctx.add('TABLES_OPERATION_DOMAIN',p,'Source domain does not prove the target refinement');
   }
   return;
  }
  if(v.kind==='literal'){inspectStoredLiteral(selected.column,selected.element,v.value,ctx,p+'/value');return;}
  used.add(v.parameter);const parameter=parameters.get(v.parameter);
  if(!parameter){ctx.add('TABLES_OPERATION_PARAMETER',p+'/parameter','Unknown operation parameter');return;}
  const source=ctx.field(parameter.field,p+'/parameter');
  const sourceColumn=parameter&&payload.tables.flatMap(t=>t.columns).find(c=>refKey(c.field)===refKey(parameter.field));
  if(source&&(domain(source)!==domain(selected.element)||source.nullability!==selected.element.nullability||!sourceColumn||nativeDomain(sourceColumn.nativeType)!==nativeDomain(selected.column.nativeType)))ctx.add('TABLES_OPERATION_DOMAIN',p,'Parameter and selected Field domains must match exactly');
 };
 const predicate=(node:TableOperationPredicate,p:string,depth=0,scope=table):void=>{
  if(!ctx.charge(p,depth))return;
  if(node.op==='all')return;
  if(node.op==='related'){
   const target=payload.tables.find(t=>t.id===node.table);
   if(!target){ctx.add('TABLES_OPERATION_TABLE',p+'/table','Related predicates require an original table in the owning module');return;}
   ctx.unique(node.matches,m=>refKey(m.source)+'/'+refKey(m.target),p+'/matches','related match');
   for(const[i,pair]of node.matches.entries()){
    const source=field(pair.source,p+'/matches/'+i+'/source',scope),destination=field(pair.target,p+'/matches/'+i+'/target',target);
    if(source&&destination&&(source.element.scalarType!==destination.element.scalarType||nativeDomain(source.column.nativeType)!==nativeDomain(destination.column.nativeType)))ctx.add('TABLES_OPERATION_DOMAIN',p+'/matches/'+i,'Related equality requires the same native scalar capacity');
   }
   predicate(node.where,p+'/where',depth+1,target);return;
  }

  if(node.op==='and'||node.op==='or'){for(const[i,child]of node.args.entries())predicate(child,p+'/args/'+i,depth+1,scope);return;}
  if(node.op==='not'){predicate(node.arg,p+'/arg',depth+1,scope);return;}
  const selected=field(node.field,p+'/field',scope);if(!selected)return;
  if(node.op==='isNull')return;
  if(node.op==='in'){for(const[i,item]of node.values.entries())value(item,node.field,p+'/values/'+i,scope);return;}
  value(node.value,node.field,p+'/value',scope);
  if(node.op==='startsWith'&&selected.element.scalarType!=='string')ctx.add('TABLES_OPERATION_DOMAIN',p,'Prefix predicate requires a string Field');
  if(['lt','le','gt','ge'].includes(node.op)&&!['integer','decimal','string','date','timestamp'].includes(selected.element.scalarType??''))ctx.add('TABLES_OPERATION_DOMAIN',p,'Ordered predicate requires a supported ordered scalar');
 };
 const refs=(items:TableRef[],p:string)=>{ctx.unique(items,refKey,p,'operation result Field');for(const[i,ref]of items.entries())field(ref,p+'/'+i);};
 const body=command.body;
 if(body.kind==='read'){
  if(command.replay!=='none'||command.batch)ctx.add('TABLES_OPERATION_READ',path,'Read operations cannot declare write replay or atomic write batches');
  refs(body.fields,path+'/body/fields');predicate(body.where,path+'/body/where');
  ctx.unique(body.orderBy,o=>refKey(o.field),path+'/body/orderBy','ordering Field');
  for(const[i,order]of body.orderBy.entries())field(order.field,path+'/body/orderBy/'+i+'/field');
  if(body.result==='count'&&(body.fields.length||body.orderBy.length))ctx.add('TABLES_OPERATION_COUNT',path+'/body','Count has no projected fields or ordering');
  if(['one','optional','count'].includes(body.result)&&body.maxRows!==1)ctx.add('TABLES_OPERATION_RESULT',path+'/body/maxRows','Singleton/count results have a declared result bound of one');
  if(body.result!=='count'&&!body.fields.length)ctx.add('TABLES_OPERATION_RESULT',path+'/body/fields','Row operations require explicit projected fields');
  if(body.result==='page'){
   const record=ctx.element(table.record),keys=record?.keys??[];
   const key=keys.find(k=>k.id===body.cursorKey);
   const suffix=key?body.orderBy.slice(-key.fields.length):[];
   if(!key||body.orderBy.length<key.fields.length||suffix.some((o,i)=>refKey(o.field)!==refKey(key.fields[i]!)))ctx.add('TABLES_OPERATION_PAGE',path+'/body','Page ordering must end with the complete ordered original Key');
   for(const[i,order]of body.orderBy.entries()){
    const selected=field(order.field,path+'/body/orderBy/'+i+'/field');
    if(selected&&(selected.element.nullability!=='required'||!['integer','decimal','string','date','timestamp','uuid'].includes(selected.element.scalarType??'')))ctx.add('TABLES_OPERATION_PAGE',path+'/body/orderBy/'+i,'Cursor ordering requires required ordered scalar Fields');
    if(!body.fields.some(r=>refKey(r)===refKey(order.field)))ctx.add('TABLES_OPERATION_PAGE',path+'/body/fields','Page must project every ordering Field');
   }
  }else if(body.cursorKey!==undefined)ctx.add('TABLES_OPERATION_PAGE',path+'/body/cursorKey','Cursor Key is only meaningful for page results');
 }else{
  if(command.consistency!=='transaction'||command.replay==='none')ctx.add('TABLES_OPERATION_WRITE',path,'Writes require transaction consistency and explicit caller-key replay');
  refs(body.returning,path+'/body/returning');
  if(body.kind==='insertFrom')predicate(body.source.where,path+'/body/source/where',0,sourceTable!);
  if(body.kind==='update'||body.kind==='delete')predicate(body.where,path+'/body/where');
  if(body.kind!=='delete'){
   ctx.unique(body.values,a=>refKey(a.field),path+'/body/values','assigned Field');
   for(const[i,assignment]of body.values.entries()){
    const p=path+'/body/values/'+i,selected=field(assignment.field,p+'/field');
    if(selected?.column.generated)ctx.add('TABLES_OPERATION_GENERATED',p,'Ordinary operations cannot assign generated identity columns');
    if(body.kind==='update'&&selected&&!mutable(table,assignment.field,ctx))ctx.add('TABLES_OPERATION_IMMUTABLE',p,'Ordinary updates cannot change Keys, immutable or generated columns');
    value(assignment.value,assignment.field,p+'/value',table,true);
   }
   if(body.kind==='insert'||body.kind==='insertFrom'||body.kind==='upsert')for(const column of table.columns){
    const element=ctx.element(column.field);
    if(element?.nullability==='required'&&!column.default&&!column.generated&&!body.values.some(a=>refKey(a.field)===refKey(column.field)))ctx.add('TABLES_OPERATION_REQUIRED',path+'/body/values','Create input omits a required column without a declared default');
   }
  }
  if(body.kind==='upsert'){
   const key=ctx.element(table.record)?.keys?.find(k=>k.id===body.conflictKey);
   if(!key||key.fields.some(f=>!body.values.some(a=>refKey(a.field)===refKey(f))))ctx.add('TABLES_OPERATION_CONFLICT',path+'/body/conflictKey','Upsert requires an original Key with all components in create input');
   refs(body.updateFields,path+'/body/updateFields');
   if((body.onConflict==='ignore')!==!body.updateFields.length)ctx.add('TABLES_OPERATION_CONFLICT',path+'/body/updateFields','Ignore has no updates; update requires a nonempty whitelist');
   for(const[i,ref]of body.updateFields.entries())if(!mutable(table,ref,ctx)||!body.values.some(a=>refKey(a.field)===refKey(ref)))ctx.add('TABLES_OPERATION_CONFLICT',path+'/body/updateFields/'+i,'Conflict update requires a mutable Field present in create input');
  }
 }
 for(const p of command.parameters)if(!used.has(p.id))ctx.add('TABLES_OPERATION_PARAMETER_UNUSED',path+'/parameters','Every declared input must be used by the operation');
}
function mutable(table:TableDeclaration,ref:TableRef,ctx:TableContext):boolean {
 const column=table.columns.find(c=>refKey(c.field)===refKey(ref));
 return !!column&&!column.immutable&&!column.generated&&!ctx.element(table.record)?.keys?.some(k=>k.fields.some(f=>refKey(f)===refKey(ref)));
}

function nativeDomain(type:TableNativeType):string {
 return JSON.stringify([type.kind,'length'in type?type.length:null,'precision'in type?type.precision:null,'scale'in type?type.scale:null]);
}

/** Fixed query text is compiler input. SQL parsing/resolution remains Weft-owned. */
function inspectQuery(command:TableOperation,ctx:TableContext,path:string):void {
 const body=command.body;if(body.kind!=='query')return;
 if(command.replay!=='none'||command.batch)ctx.add('TABLES_OPERATION_READ',path,'Queries cannot declare write replay or write batches');
 if(new TextEncoder().encode(body.sql).length>1048576||body.sql.includes('\0'))ctx.add('TABLES_QUERY_SQL',path+'/body/sql','Bounded fixed UTF-8 query source required');
 ctx.unique(command.parameters,p=>p.id,path+'/parameters','operation parameter');
 ctx.unique(body.outputs,o=>o.name,path+'/body/outputs','query output alias');
 ctx.unique(body.outputs,o=>refKey(o.field),path+'/body/outputs','query output Field');
 const inspect=(ref:TableRef,p:string)=>{
  const field=ctx.field(ref,p);
  if(ref.module!==ctx.module.id)ctx.add('TABLES_QUERY_MODULE',p,'Query domains must belong to the owning module');
  if(field&&(Object.keys(field.extensions).length||field.semanticTypes?.length))ctx.add('TABLES_OPERATION_MEANING',p,'Selected query Field meaning needs a separately qualified interpreter',true);
 };
 for(const[i,p]of command.parameters.entries())inspect(p.field,path+'/parameters/'+i+'/field');
 for(const[i,o]of body.outputs.entries()){
  ctx.identifier(o.name,path+'/body/outputs/'+i+'/name');
  inspect(o.field,path+'/body/outputs/'+i+'/field');
 }
 // Weft checks the parsed statement, parameter use, result aliases/types/nullability
 // and complete relation scope. A textual regexp here would be a second parser.
}
