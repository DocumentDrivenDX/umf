// SPDX-License-Identifier: MIT OR Apache-2.0
import type {TableColumn,TableRef} from '../extensions/tables';
import {nativeType,typedDefaultExpressionSql} from '../table-deployment/sql';
import {renderTableGrantSql,type TableGrantEffectRow} from '../table-deployment/grants';

export type G02FieldEffectRole='add-column'|'target-check'|'backfill'|'install-default'|'tighten-not-null'|'validate-target-check';
export interface G02FieldEffectInput {
 role:G02FieldEffectRole;
 schema:string;
 table:string;
 tableName:string;
 column:TableColumn;
 collation?:'C'|null;
 sourcePath:string;
 field:TableRef;
 rowOperationId?:string;
 operation?:string;
 notValid?:boolean;
 constraintName?:string;
 checkDefinitionSql?:string;
}
export interface G02FieldEffect {
 role:G02FieldEffectRole;
 kind:'table'|'backfill';
 sourcePath:string;
 sql:string;
 field:TableRef;
 table:string;
 rowOperationId?:string;
 operation?:string;
}
export type G02GrantEffectRole='grant-add'|'grant-revoke';
export interface G02GrantEffectInput {role:G02GrantEffectRole;sourcePath:string;row:TableGrantEffectRow}
export interface G02GrantEffect {role:G02GrantEffectRole;kind:'grant';sourcePath:string;sql:string;row:TableGrantEffectRow}
const quote=(value:string):string=>'"'+value.replaceAll('"','""')+'"';

/** Narrow inert person-UPDATE grant wrapper; the caller binds the row to original sources. */
export function renderG02GrantEffect(input:G02GrantEffectInput):G02GrantEffect{
 const {role,sourcePath,row}=input;
 if((role!=='grant-add'&&role!=='grant-revoke')||!/^\/modules\/\d+\/extensions\/umf\.tables\/tables\/\d+\/policy\/person\/update$/.test(sourcePath)||row.privilege!=='update'||row.grantOption!==false||!Array.isArray(row.columns)||row.columns.length===0)throw new Error('G02_GRANT_EFFECT_BINDING');
 return {role,kind:'grant',sourcePath,sql:renderTableGrantSql(row,role==='grant-add'?'grant':'revoke'),row:{...row,columns:[...row.columns]}};
}

/** Shared inert G02 field-effect renderer used by legacy emission and G10 composition. */
export function renderG02FieldEffect(input:G02FieldEffectInput):G02FieldEffect{
 const {role,schema,table,tableName,column,sourcePath,field}=input;
 if(!schema||!table||!tableName||!sourcePath||!field.module||!field.element)throw new Error('G02_FIELD_EFFECT_BINDING');
 let kind:G02FieldEffect['kind']='table',sql:string,operation=input.operation;
 switch(role){
  case 'add-column':
   sql='ALTER TABLE '+quote(schema)+'.'+quote(tableName)+' ADD COLUMN '+quote(column.name)+' '+nativeType(column.nativeType)+(input.collation==='C'?' COLLATE pg_catalog."C"':'');
   operation??='add-column';
   break;
  case 'target-check':
   if(!input.checkDefinitionSql)throw new Error('G02_FIELD_EFFECT_CHECK');
   sql='ALTER TABLE '+quote(schema)+'.'+quote(tableName)+' ADD '+input.checkDefinitionSql+(input.notValid?' NOT VALID':'');
   operation??='target-check';
   break;
  case 'validate-target-check':
   if(!input.constraintName)throw new Error('G02_FIELD_EFFECT_CHECK_NAME');
   sql='ALTER TABLE '+quote(schema)+'.'+quote(tableName)+' VALIDATE CONSTRAINT '+quote(input.constraintName);
   operation??='validate';
   break;
  case 'backfill':
   if(!input.rowOperationId)throw new Error('G02_FIELD_EFFECT_BACKFILL');
   kind='backfill';sql='';operation=input.rowOperationId;
   break;
  case 'install-default':
   if(!column.default)throw new Error('G02_FIELD_EFFECT_DEFAULT');
   sql='ALTER TABLE '+quote(schema)+'.'+quote(tableName)+' ALTER COLUMN '+quote(column.name)+' SET DEFAULT '+typedDefaultExpressionSql(column.default);
   operation??='install-default';
   break;
  case 'tighten-not-null':
   sql='ALTER TABLE '+quote(schema)+'.'+quote(tableName)+' ALTER COLUMN '+quote(column.name)+' SET NOT NULL';
   operation??='tighten-not-null';
   break;
 }
 return {role,kind,sourcePath,sql,table,field:{module:field.module,element:field.element},...(input.rowOperationId?{rowOperationId:input.rowOperationId}:{}),...(operation?{operation}:{})};
}
