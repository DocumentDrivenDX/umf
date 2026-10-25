import type {TableDeclaration,TableOperation,TableOperationPredicate,TableOperationV1,TableOperationValue,RowExpression,RowExpressionOperation,RowExpressionPredicate,TableRef} from '../extensions/tables/types';
import {hashCanonical} from '../compilation/bundle/hash';
import type {AccountingContext} from '../model/internal/accounting-context';
import {copyJsonCharged} from '../model/json';

export type FieldBinding={table:string;field:TableRef};
export type LogicalParameterBinding={parameterId:string;parameterPath:string;field:TableRef;definitionPath:string;definition:Record<string,unknown>};
export type KeyBinding={table:string;key:string;purpose:'cursor'|'conflict';record:TableRef;fields:TableRef[];definitionPath:string;definition:Record<string,unknown>};
const sameRef=(a:TableRef,b:TableRef)=>a.module===b.module&&a.element===b.element;
const refKey=(value:TableRef)=>JSON.stringify([value.module,value.element]);
const copyHooks=(accounting:AccountingContext)=>({beforeProperty:(key:string,path:string,isArray:boolean)=>{accounting.visit('operation-copy-property-preflight',path);if(!isArray)accounting.scanUtf8(key,path);},retainText:(text:string,path:string)=>{accounting.scanUtf8(text,path);}});
function operationPredicateRefs(value:TableOperationPredicate,currentTable:string,accounting?:AccountingContext):{fields:FieldBinding[];tables:string[]}{
 const fields:FieldBinding[]=[],tables:string[]=[];const addField=(table:string,field:TableRef)=>{accounting?.visit('operation-predicate-field-retention','/commands');fields.push({table,field});};const addTable=(table:string)=>{accounting?.visit('operation-predicate-table-retention','/commands');tables.push(table);};const visit=(node:TableOperationPredicate,table:string):void=>{accounting?.visit('operation-predicate-node','/commands');
  switch(node.op){
   case'all':return;
   case'related':addTable(node.table);for(const pair of node.matches){addField(table,pair.source);addField(node.table,pair.target);}visit(node.where,node.table);return;
   case'and':case'or':for(const child of node.args)visit(child,table);return;
   case'not':visit(node.arg,table);return;
   case'isNull':addField(table,node.field);return;
   case'in':addField(table,node.field);for(const v of node.values)if(v.kind==='sourceField')addField(table,v.field);return;
   case'eq':case'ne':case'lt':case'le':case'gt':case'ge':case'startsWith':addField(table,node.field);if(node.value.kind==='sourceField')addField(table,node.value.field);return;
   default:{const neverNode:never=node;throw new Error('G10_OPERATION_PREDICATE_UNKNOWN:'+String(neverNode));}
  }
 };visit(value,currentTable);return {fields,tables};
}
export function operationReferences(operation:TableOperation,tables:TableDeclaration[],source:Record<string,any>,accounting?:AccountingContext):{fields:FieldBinding[];tables:string[];keys:{table:string;key:string;purpose:'cursor'|'conflict'}[];logicalParameters:LogicalParameterBinding[]}{
 accounting?.visit('operation-reference-dispatch','/commands');
 const fields:FieldBinding[]=[],tableIds:string[]=[],keys:{table:string;key:string;purpose:'cursor'|'conflict'}[]=[];
 const addField=(table:string,field:TableRef)=>{accounting?.visit('operation-field-reference-retention','/commands');fields.push({table,field});};
 const addTable=(table:string)=>{accounting?.visit('operation-table-reference-retention','/commands');tableIds.push(table);};
 if(operation.version==='umf.table-operation/0.2'){
  const rowOperation=operation as RowExpressionOperation;addTable(rowOperation.body.table);addField(rowOperation.body.table,rowOperation.body.where.field);
  const expression=(node:RowExpression):void=>{accounting?.visit('operation-expression-node','/commands');switch(node.op){case'field':addField(rowOperation.body.table,node.field);return;case'literal':return;case'coalesce':case'concat':for(const child of node.args){accounting?.visit('operation-expression-child','/commands');expression(child);}return;case'add':case'subtract':case'multiply':expression(node.left);expression(node.right);return;case'conditional':predicate(node.when);expression(node.then);expression(node.else);return;default:{const neverNode:never=node;throw new Error('G10_ROW_EXPRESSION_UNKNOWN:'+String(neverNode));}}};
  const predicate=(node:RowExpressionPredicate):void=>{accounting?.visit('operation-row-predicate-node','/commands');switch(node.op){case'all':return;case'and':case'or':for(const child of node.args){accounting?.visit('operation-row-predicate-child','/commands');predicate(child);}return;case'not':predicate(node.arg);return;case'isNull':addField(rowOperation.body.table,node.field);return;case'in':case'eq':case'ne':case'lt':case'le':case'gt':case'ge':case'startsWith':addField(rowOperation.body.table,node.field);return;default:{const neverNode:never=node;throw new Error('G10_ROW_PREDICATE_UNKNOWN:'+String(neverNode));}}};
  for(const assignment of rowOperation.body.values){accounting?.visit('operation-row-assignment','/commands');addField(rowOperation.body.table,assignment.field);expression(assignment.value.expression);}
  return {fields,tables:tableIds,keys,logicalParameters:[]};
 }
 const v1=operation as TableOperationV1,body=v1.body;
 const addValue=(table:string,value:TableOperationValue)=>{if(value.kind==='sourceField')addField(table,value.field);};
 const addPredicate=(table:string,predicate:TableOperationPredicate)=>{const refs=operationPredicateRefs(predicate,table,accounting);for(const binding of refs.fields)addField(binding.table,binding.field);for(const related of refs.tables){accounting?.visit('operation-related-table','/commands');addTable(related);}};
 switch(body.kind){
  case'query':
   // Query SQL is intentionally opaque; conservatively bind every table while
   // retaining the complete original command and its exact SQL in sourceClosure.
   for(const table of tables){accounting?.visit('operation-query-table','/commands');addTable(table.id);}for(const output of body.outputs){accounting?.visit('operation-query-output','/commands');for(const owner of tables){accounting?.visit('operation-query-owner','/commands');let owns=false;for(const c of owner.columns){accounting?.visit('operation-query-column','/commands');if(sameRef(c.field,output.field)){owns=true;break;}}if(owns)addField(owner.id,output.field);}}break;
  case'read':addTable(body.table);for(const field of body.fields)addField(body.table,field);for(const order of body.orderBy)addField(body.table,order.field);addPredicate(body.table,body.where);if(body.cursorKey){accounting?.visit('operation-key-reference-retention','/commands');keys.push({table:body.table,key:body.cursorKey,purpose:'cursor'});}break;
  case'insert':addTable(body.table);for(const assignment of body.values)addField(body.table,assignment.field),addValue(body.table,assignment.value);for(const field of body.returning)addField(body.table,field);break;
  case'insertFrom':addTable(body.table);addTable(body.source.table);addPredicate(body.source.table,body.source.where);for(const assignment of body.values){addField(body.table,assignment.field);addValue(body.source.table,assignment.value);}for(const field of body.returning)addField(body.table,field);break;
  case'update':addTable(body.table);addPredicate(body.table,body.where);for(const assignment of body.values)addField(body.table,assignment.field),addValue(body.table,assignment.value);for(const field of body.returning)addField(body.table,field);break;
  case'delete':addTable(body.table);addPredicate(body.table,body.where);for(const field of body.returning)addField(body.table,field);break;
  case'upsert':addTable(body.table);accounting?.visit('operation-key-reference-retention','/commands');keys.push({table:body.table,key:body.conflictKey,purpose:'conflict'});for(const assignment of body.values)addField(body.table,assignment.field),addValue(body.table,assignment.value);for(const field of body.updateFields)addField(body.table,field);for(const field of body.returning)addField(body.table,field);break;
  default:{const neverBody:never=body;throw new Error('G10_OPERATION_BODY_UNKNOWN:'+String(neverBody));}
 }
 const logicalParameters:LogicalParameterBinding[]=[];
 for(const [index,parameter]of v1.parameters.entries()){accounting?.visit('operation-parameter','/commands');const field=parameter.field;let moduleIndex=-1;for(let i=0;i<(source.modules?.length??0);i++){accounting?.visit('operation-parameter-module-predicate','/commands');if(source.modules[i]!.id===field.module){moduleIndex=i;break;}}const module=moduleIndex<0?undefined:source.modules[moduleIndex];let elementIndex=-1;if(module)for(let i=0;i<module.elements.length;i++){accounting?.visit('operation-parameter-element-predicate','/commands');if(module.elements[i]!.kind==='field'&&module.elements[i]!.id===field.element){elementIndex=i;break;}}const definition=elementIndex<0?undefined:module!.elements[elementIndex];let bound=false;for(const table of tables){accounting?.visit('operation-parameter-table','/commands');for(const column of table.columns){accounting?.visit('operation-parameter-column','/commands');if(sameRef(column.field,field)){bound=true;break;}}if(bound)break;}if(!definition||!bound)throw new Error('G10_OPERATION_PARAMETER_DOMAIN_UNBOUND:'+refKey(field));accounting?.visit('operation-parameter-retention','/commands');logicalParameters.push({parameterId:parameter.id,parameterPath:`/parameters/${index}/field`,field:{module:field.module,element:field.element},definitionPath:`/modules/${moduleIndex}/elements/${elementIndex}`,definition:accounting?copyJsonCharged(definition,n=>accounting.visit('operation-parameter-definition-copy','/commands'),copyHooks(accounting)):structuredClone(definition)});}
 return {fields,tables:tableIds,keys,logicalParameters};
}

export interface CreatedOperationReferenceCertificate {
 profile:'umf.table-operation-reference-certificate/0.1';
 operationId:string;
 meaningDigest:string;
 tables:string[];
 fields:FieldBinding[];
 keyUses:KeyBinding[];
 logicalParameters:LogicalParameterBinding[];
}
/** Derive a complete typed command reference certificate from the admitted UMF operation. */
export function createdOperationReferenceCertificate(operation:TableOperation,tables:TableDeclaration[],created:ReadonlySet<string>,source:Record<string,any>):CreatedOperationReferenceCertificate|null {
 if(operation.version==='umf.table-operation/0.1'&&operation.body.kind==='query')return null;
 const refs=operationReferences(operation,tables,source);
 if(!refs.tables.length||refs.tables.some(table=>!created.has(table))||refs.fields.some(binding=>!created.has(binding.table)))return null;
 const byId=new Map(tables.map(table=>[table.id,table]));
 for(const binding of refs.fields){const table=byId.get(binding.table);if(!table||!table.columns.some(column=>sameRef(column.field,binding.field)))return null;}
 if(operation.version==='umf.table-operation/0.2'){
  // The admitted v0.2 operation is a closed typed row-expression UPDATE.
  // Its expression and predicate refs are physical refs on the declared
  // carrier; unlike the opaque v0.1 SQL query, they have a finite source set.
  return {profile:'umf.table-operation-reference-certificate/0.1',operationId:operation.id,meaningDigest:hashCanonical({operation,logicalParameters:[],keyUses:[]}),tables:[...new Set(refs.tables)],fields:refs.fields.map(binding=>({table:binding.table,field:{module:binding.field.module,element:binding.field.element}})),keyUses:[],logicalParameters:[]};
 }
 if(operation.version!=='umf.table-operation/0.1')return null;
 const body=operation.body;
 const keyUses:KeyBinding[]=[];
 for(const use of refs.keys){const table=byId.get(use.table);if(!table||!created.has(use.table))return null;const recordModule=source.modules?.find((item:any)=>item.id===table.record.module),recordIndex=recordModule?.elements?.findIndex((item:any)=>item.kind==='record'&&item.id===table.record.element)??-1,record=recordIndex<0?undefined:recordModule.elements[recordIndex],keyIndex=record?.keys?.findIndex((item:any)=>item.id===use.key)??-1,key=keyIndex<0?undefined:record.keys[keyIndex];if(!record||!key||!Array.isArray(key.fields))return null;keyUses.push({table:table.id,key:use.key,purpose:use.purpose,record:{module:table.record.module,element:table.record.element},fields:structuredClone(key.fields),definitionPath:`/modules/${source.modules.indexOf(recordModule)}/elements/${recordIndex}/keys/${keyIndex}`,definition:structuredClone(key)});}
 return {profile:'umf.table-operation-reference-certificate/0.1',operationId:operation.id,meaningDigest:hashCanonical({operation,logicalParameters:refs.logicalParameters,keyUses}),tables:[...new Set(refs.tables)],fields:refs.fields.map(binding=>({table:binding.table,field:{module:binding.field.module,element:binding.field.element}})),keyUses,logicalParameters:refs.logicalParameters};
}
