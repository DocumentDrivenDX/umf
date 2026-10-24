// SPDX-License-Identifier: MIT OR Apache-2.0
import type {TableDeclaration,TableRef} from '../extensions/tables/types';
import {quoteIdentifier} from './sql';

export type TableGrantPrivilege='select'|'insert'|'update'|'delete';
export type TableGrantAudience='person'|'batch';

/** Complete typed ordinary table grant; this is compiler metadata, not authority. */
export interface TableGrantEffectRow {
	table:string;
	schema:string;
	relation:string;
	role:string;
	privilege:TableGrantPrivilege;
	columns:string[]|null;
	grantOption:false;
}

export interface GrantBoundRecord {
	kind?:string;
	id:string;
	keys?:{fields:TableRef[]}[];
}
interface GrantBoundRecordWithKeys extends GrantBoundRecord {
	keys:{fields:TableRef[]}[];
}

function sameRef(left:TableRef,right:TableRef):boolean{
	return left.module===right.module&&left.element===right.element;
}

function refKey(ref:TableRef):string{
	return JSON.stringify([ref.module,ref.element]);
}

function validName(value:unknown):value is string{
	return typeof value==='string'&&value.length>0&&!value.includes('\0');
}

function validateGrantRecordBinding(table:TableDeclaration,recordModule:string,record:GrantBoundRecord):asserts record is GrantBoundRecordWithKeys{
	if(!validName(table.id)||!validName(table.name)||!validName(recordModule)||record.kind!=='record'||record.id!==table.record.element||recordModule!==table.record.module||!Array.isArray(record.keys))throw new Error('TABLE_GRANT_RECORD_BINDING');
}

/** Return the source-authored mutable UPDATE columns in their original order. */
export function mutableTableGrantColumns(table:TableDeclaration,recordModule:string,record:GrantBoundRecord):string[]{
	validateGrantRecordBinding(table,recordModule,record);
	const keyFields=new Set<string>();
	for(const key of record.keys){
		if(!key||!Array.isArray(key.fields))throw new Error('TABLE_GRANT_RECORD_KEYS');
		for(const field of key.fields){
			if(!field||!validName(field.module)||!validName(field.element))throw new Error('TABLE_GRANT_RECORD_KEYS');
			keyFields.add(refKey(field));
		}
	}
	const seenFields=new Set<string>(),seenNames=new Set<string>(),columns:string[]=[];
	for(const column of table.columns){
		if(!column||!column.field||!validName(column.field.module)||!validName(column.field.element)||!validName(column.name))throw new Error('TABLE_GRANT_COLUMN_BINDING');
		const key=refKey(column.field);
		if(seenFields.has(key)||seenNames.has(column.name))throw new Error('TABLE_GRANT_COLUMN_DUPLICATE');
		seenFields.add(key);seenNames.add(column.name);
		if(column.immutable!==true&&!column.generated&&!keyFields.has(key))columns.push(column.name);
	}
	return columns;
}

export function deriveTableGrantEffectRow(input:{table:TableDeclaration;recordModule:string;record:GrantBoundRecord;schema:string;role:string;audience:TableGrantAudience;command:TableGrantPrivilege}):TableGrantEffectRow{
	const {table,recordModule,record,schema,role,audience,command}=input;
	if(!validName(schema)||!validName(role)||!['person','batch'].includes(audience)||!['select','insert','update','delete'].includes(command))throw new Error('TABLE_GRANT_BINDING');
	validateGrantRecordBinding(table,recordModule,record);
	if(table.policy[audience][command].kind==='deny')throw new Error('TABLE_GRANT_DENIED_POLICY');
	const columns=command==='update'?mutableTableGrantColumns(table,recordModule,record):null;
	if(columns!==null&&columns.length===0)throw new Error('TABLE_GRANT_EMPTY_UPDATE');
	return {table:table.id,schema,relation:table.name,role,privilege:command,columns:columns===null?null:[...columns],grantOption:false};
}

function validateRow(row:TableGrantEffectRow):void{
	const keys=Object.keys(row).sort(),expected=['columns','grantOption','privilege','relation','role','schema','table'];
	if(keys.length!==expected.length||keys.some((key,index)=>key!==expected[index])||!validName(row.table)||!validName(row.schema)||!validName(row.relation)||!validName(row.role)||!['select','insert','update','delete'].includes(row.privilege)||row.grantOption!==false)throw new Error('TABLE_GRANT_ROW');
	if(row.privilege==='update'){
		if(!Array.isArray(row.columns)||row.columns.length===0||row.columns.some(column=>!validName(column))||new Set(row.columns).size!==row.columns.length)throw new Error('TABLE_GRANT_UPDATE_COLUMNS');
	}else if(row.columns!==null)throw new Error('TABLE_GRANT_NONUPDATE_COLUMNS');
}

/** Exact existing LOCAL SQL spelling for ordinary table GRANT and REVOKE rows. */
export function renderTableGrantSql(row:TableGrantEffectRow,direction:'grant'|'revoke'):string{
	validateRow(row);
	if(direction!=='grant'&&direction!=='revoke')throw new Error('TABLE_GRANT_DIRECTION');
	const privilege=row.privilege==='update'?'UPDATE ('+row.columns!.map(quoteIdentifier).join(', ')+')':row.privilege.toUpperCase();
	return direction==='grant'
		?'GRANT '+privilege+' ON TABLE '+quoteIdentifier(row.schema)+'.'+quoteIdentifier(row.relation)+' TO '+quoteIdentifier(row.role)
		:'REVOKE '+privilege+' ON TABLE '+quoteIdentifier(row.schema)+'.'+quoteIdentifier(row.relation)+' FROM '+quoteIdentifier(row.role);
}
