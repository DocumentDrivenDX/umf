// SPDX-License-Identifier: MIT OR Apache-2.0
import type {TableDeclaration,TableRef} from '../extensions/tables/types';
import {quoteIdentifier} from './sql';
import {sqlJoin} from './sql';
import type {AccountingContext} from '../model/internal/accounting-context';

export type TableGrantPrivilege='select'|'insert'|'update'|'delete';
export type TableGrantAudience='person'|'batch';
function textBytes(value:string):number{let bytes=0;for(let index=0;index<value.length;index++){const unit=value.charCodeAt(index);if(unit<0x80)bytes++;else if(unit<0x800)bytes+=2;else if(unit>=0xd800&&unit<=0xdbff&&value.charCodeAt(index+1)>=0xdc00&&value.charCodeAt(index+1)<=0xdfff){bytes+=4;index++;}else bytes+=3;}return bytes;}

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

function refKey(ref:TableRef,accounting?:AccountingContext,path='/grant/reference'):string{
	if(accounting){const bytes=accounting.scanUtf8(ref.module,path)+accounting.scanUtf8(ref.element,path)+1;accounting.retainBytes('grant-reference-key',bytes,path);}
	// NUL is excluded by validName at every call site, so this delimiter is
	// collision-free and avoids an unmetered JSON.stringify allocation.
	return ref.module+'\0'+ref.element;
}

function validName(value:unknown):value is string{
	return typeof value==='string'&&value.length>0&&!value.includes('\0');
}

function validateGrantRecordBinding(table:TableDeclaration,recordModule:string,record:GrantBoundRecord):asserts record is GrantBoundRecordWithKeys{
	if(!validName(table.id)||!validName(table.name)||!validName(recordModule)||record.kind!=='record'||record.id!==table.record.element||recordModule!==table.record.module||!Array.isArray(record.keys))throw new Error('TABLE_GRANT_RECORD_BINDING');
}

/** Return the source-authored mutable UPDATE columns in their original order. */
export function mutableTableGrantColumns(table:TableDeclaration,recordModule:string,record:GrantBoundRecord,accounting?:AccountingContext,path='/grant/columns'):string[]{
	validateGrantRecordBinding(table,recordModule,record);
	accounting?.visit('grant-working-carriers',path,3);
	const keyFields=new Set<string>();
	for(const key of record.keys){
  accounting?.visit('grant-key-scan',path);
		if(!key||!Array.isArray(key.fields))throw new Error('TABLE_GRANT_RECORD_KEYS');
		for(const field of key.fields){
			accounting?.visit('grant-key-field-scan',path);
			if(!field||!validName(field.module)||!validName(field.element))throw new Error('TABLE_GRANT_RECORD_KEYS');
			accounting?.visit('grant-key-field-index-retention',path);keyFields.add(refKey(field,accounting,path));
		}
	}
	const seenFields=new Set<string>(),seenNames=new Set<string>(),columns:string[]=[];
	for(const column of table.columns){
  accounting?.visit('grant-column-scan',path);
		if(!column||!column.field||!validName(column.field.module)||!validName(column.field.element)||!validName(column.name))throw new Error('TABLE_GRANT_COLUMN_BINDING');
		const key=refKey(column.field,accounting,path);
		if(seenFields.has(key)||seenNames.has(column.name))throw new Error('TABLE_GRANT_COLUMN_DUPLICATE');
		accounting?.visit('grant-column-field-index-retention',path);seenFields.add(key);accounting?.visit('grant-column-name-index-retention',path);seenNames.add(column.name);
  if(column.immutable!==true&&!column.generated&&!keyFields.has(key)){accounting?.visit('grant-column-retention',path);columns.push(column.name);}
	}
	return columns;
}

export function deriveTableGrantEffectRow(input:{table:TableDeclaration;recordModule:string;record:GrantBoundRecord;schema:string;role:string;audience:TableGrantAudience;command:TableGrantPrivilege},accounting?:AccountingContext,path='/grant'):TableGrantEffectRow{
	const {table,recordModule,record,schema,role,audience,command}=input;
	if(!validName(schema)||!validName(role)||!['person','batch'].includes(audience)||!['select','insert','update','delete'].includes(command))throw new Error('TABLE_GRANT_BINDING');
	validateGrantRecordBinding(table,recordModule,record);
	if(table.policy[audience][command].kind==='deny')throw new Error('TABLE_GRANT_DENIED_POLICY');
	const columns=command==='update'?mutableTableGrantColumns(table,recordModule,record,accounting,path):null;
	if(columns!==null&&columns.length===0)throw new Error('TABLE_GRANT_EMPTY_UPDATE');
	if(columns!==null){accounting?.visit('grant-row-column-copy',path,columns.length);accounting?.retainBytes('grant-row-column-copy-bytes',columns.reduce((sum,column)=>sum+textBytes(column),0),path);}
	accounting?.visit('grant-row-object-construction',path,8);
	return {table:table.id,schema,relation:table.name,role,privilege:command,columns:columns===null?null:columns.slice(),grantOption:false};
}

function validateRow(row:TableGrantEffectRow,accounting?:AccountingContext,path='/grant'):void{
	accounting?.visit('grant-row-key-array-construction',path,7);const expected=['columns','grantOption','privilege','relation','role','schema','table'];accounting?.visit('grant-row-key-index-retention',path,expected.length);const allowed=new Set(expected);let keyCount=0;for(const key in row)if(Object.hasOwn(row,key)){accounting?.visit('grant-row-key-scan',path);keyCount++;if(!allowed.has(key))throw new Error('TABLE_GRANT_ROW');}
	if(keyCount!==expected.length||!validName(row.table)||!validName(row.schema)||!validName(row.relation)||!validName(row.role)||!['select','insert','update','delete'].includes(row.privilege)||row.grantOption!==false)throw new Error('TABLE_GRANT_ROW');
	if(row.privilege==='update'){
		if(!Array.isArray(row.columns)||row.columns.length===0)throw new Error('TABLE_GRANT_UPDATE_COLUMNS');accounting?.visit('grant-row-column-index-construction',path);const seen=new Set<string>();for(const column of row.columns){accounting?.visit('grant-row-column-validation',path);if(!validName(column)||seen.has(column))throw new Error('TABLE_GRANT_UPDATE_COLUMNS');accounting?.visit('grant-row-column-key-retention',path);seen.add(column);}
	}else if(row.columns!==null)throw new Error('TABLE_GRANT_NONUPDATE_COLUMNS');
}

/** Exact existing LOCAL SQL spelling for ordinary table GRANT and REVOKE rows. */
export function renderTableGrantSql(row:TableGrantEffectRow,direction:'grant'|'revoke',accounting?:AccountingContext,path='/grant/sql'):string{
	validateRow(row,accounting,path);
	if(direction!=='grant'&&direction!=='revoke')throw new Error('TABLE_GRANT_DIRECTION');
	let privilege=row.privilege.toUpperCase();if(row.privilege==='update'){accounting?.visit('grant-render-working-carrier',path);const chunks=['UPDATE ('];for(let i=0;i<row.columns!.length;i++){accounting?.visit('grant-render-column',path);if(i){accounting?.visit('grant-render-separator-retention',path);chunks.push(', ');}const quoted=quoteIdentifier(row.columns![i]!,accounting,path);accounting?.visit('grant-render-column-retention',path);chunks.push(quoted);}accounting?.visit('grant-render-close-retention',path);chunks.push(')');privilege=sqlJoin(chunks,accounting,path);}
	return direction==='grant'
		?sqlJoin(['GRANT ',privilege,' ON TABLE ',quoteIdentifier(row.schema,accounting,path),'.',quoteIdentifier(row.relation,accounting,path),' TO ',quoteIdentifier(row.role,accounting,path)],accounting,path)
		:sqlJoin(['REVOKE ',privilege,' ON TABLE ',quoteIdentifier(row.schema,accounting,path),'.',quoteIdentifier(row.relation,accounting,path),' FROM ',quoteIdentifier(row.role,accounting,path)],accounting,path);
}
