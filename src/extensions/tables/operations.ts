// SPDX-License-Identifier: MIT OR Apache-2.0
import operationSchema from '../../../spec/extensions/tables/operation.schema.json';
import tableSchema from '../../../spec/extensions/tables/schema.json';
import {createValidator} from '../../validation/schema';
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
 const table=payload.tables.find(t=>t.id===command.body.table);
 if(!table){ctx.add('TABLES_OPERATION_TABLE',path+'/body/table','Operation requires a table in its owning module');return;}
 const parameters=new Map(command.parameters.map(p=>[p.id,p]));
 ctx.unique(command.parameters,p=>p.id,path+'/parameters','operation parameter');
 for(const[i,p]of command.parameters.entries()){
  const field=ctx.field(p.field,path+'/parameters/'+i+'/field');
  if(p.field.module!==ctx.module.id||!payload.tables.some(t=>t.columns.some(c=>refKey(c.field)===refKey(p.field))))ctx.add('TABLES_OPERATION_PARAMETER',path+'/parameters/'+i+'/field','Parameter domain must be a declared column of the owning module');
  if(field&&(Object.keys(field.extensions).length||field.semanticTypes?.length))ctx.add('TABLES_OPERATION_MEANING',path+'/parameters/'+i+'/field','Parameter meaning needs a separately qualified interpreter',true);
 }
 const used=new Set<string>();
 const field=(ref:TableRef,p:string)=>{
  const column=table.columns.find(c=>refKey(c.field)===refKey(ref));
  if(!column){ctx.add('TABLES_OPERATION_FIELD',p,'Field must belong to the operation table');return;}
  const element=ctx.field(ref,p);return element?{column,element}:undefined;
 };
 const value=(v:TableOperationValue,target:TableRef,p:string):void=>{
  const selected=field(target,p);if(!selected)return;
  if(v.kind==='currentTimestamp'){if(selected.column.nativeType.kind!=='timestamptz'||selected.element.scalarType!=='timestamp')ctx.add('TABLES_OPERATION_DOMAIN',p,'Transaction timestamp requires explicit instant storage');return;}
  if(v.kind==='literal'){inspectStoredLiteral(selected.column,selected.element,v.value,ctx,p+'/value');return;}
  used.add(v.parameter);const parameter=parameters.get(v.parameter);
  if(!parameter){ctx.add('TABLES_OPERATION_PARAMETER',p+'/parameter','Unknown operation parameter');return;}
  const source=ctx.field(parameter.field,p+'/parameter');
  const sourceColumn=parameter&&payload.tables.flatMap(t=>t.columns).find(c=>refKey(c.field)===refKey(parameter.field));
  if(source&&(domain(source)!==domain(selected.element)||source.nullability!==selected.element.nullability||!sourceColumn||nativeDomain(sourceColumn.nativeType)!==nativeDomain(selected.column.nativeType)))ctx.add('TABLES_OPERATION_DOMAIN',p,'Parameter and selected Field domains must match exactly');
 };
 const predicate=(node:TableOperationPredicate,p:string,depth=0):void=>{
  if(!ctx.charge(p,depth))return;
  if(node.op==='all')return;
  if(node.op==='and'||node.op==='or'){for(const[i,child]of node.args.entries())predicate(child,p+'/args/'+i,depth+1);return;}
  if(node.op==='not'){predicate(node.arg,p+'/arg',depth+1);return;}
  const selected=field(node.field,p+'/field');if(!selected)return;
  if(node.op==='isNull')return;
  if(node.op==='in'){for(const[i,item]of node.values.entries())value(item,node.field,p+'/values/'+i);return;}
  value(node.value,node.field,p+'/value');
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
   if(!key||body.orderBy.length!==key.fields.length||body.orderBy.some((o,i)=>o.direction!=='asc'||refKey(o.field)!==refKey(key.fields[i]!)))ctx.add('TABLES_OPERATION_PAGE',path+'/body','Page requires the complete ordered original Key, ascending');
   if(key?.fields.some(f=>!body.fields.some(r=>refKey(r)===refKey(f))))ctx.add('TABLES_OPERATION_PAGE',path+'/body/fields','Page must project every cursor Key component');
  }else if(body.cursorKey!==undefined)ctx.add('TABLES_OPERATION_PAGE',path+'/body/cursorKey','Cursor Key is only meaningful for page results');
 }else{
  if(command.consistency!=='transaction'||command.replay==='none')ctx.add('TABLES_OPERATION_WRITE',path,'Writes require transaction consistency and explicit caller-key replay');
  refs(body.returning,path+'/body/returning');
  if(body.kind==='update'||body.kind==='delete')predicate(body.where,path+'/body/where');
  if(body.kind!=='delete'){
   ctx.unique(body.values,a=>refKey(a.field),path+'/body/values','assigned Field');
   for(const[i,assignment]of body.values.entries()){
    const p=path+'/body/values/'+i,selected=field(assignment.field,p+'/field');
    if(selected?.column.generated)ctx.add('TABLES_OPERATION_GENERATED',p,'Ordinary operations cannot assign generated identity columns');
    if(body.kind==='update'&&selected&&!mutable(table,assignment.field,ctx))ctx.add('TABLES_OPERATION_IMMUTABLE',p,'Ordinary updates cannot change Keys, immutable or generated columns');
    value(assignment.value,assignment.field,p+'/value');
   }
   if(body.kind==='insert'||body.kind==='upsert')for(const column of table.columns){
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
