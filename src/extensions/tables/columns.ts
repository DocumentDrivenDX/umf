// SPDX-License-Identifier: MIT OR Apache-2.0
import {literalIdentity,schemaCoefficient} from '../../model/schema-literals';
import {UmfError,type Element} from '../../model/types';
import {domain,refKey,TableContext} from './context';
import {inspectExpression} from './expressions';
import type {TableColumn,TableDeclaration,TableLifecyclePayload,TableRef} from './types';
const nativeFamilies:Record<string,readonly string[]>={boolean:['boolean'],text:['string'],varchar:['string'],char:['string'],int2:['integer'],int4:['integer'],int8:['integer'],float4:['float'],float8:['float'],numeric:['decimal'],date:['date'],timestamp:['timestamp'],timestamptz:['timestamp'],uuid:['uuid'],bytea:['binary','bits128']};
export function inspectColumn(column:TableColumn,field:Element|undefined,ctx:TableContext,path:string):void{
 ctx.identifier(column.name,path+'/name');if(!field)return;
 if(!nativeFamilies[column.nativeType.kind]?.includes(field.scalarType??''))ctx.add('TABLES_NATIVE_TYPE',path+'/nativeType','Native type and logical scalar family differ');
 if(column.nativeType.kind==='numeric'&&column.nativeType.scale>column.nativeType.precision)ctx.add('TABLES_NUMERIC',path+'/nativeType/scale','Numeric scale exceeds precision');
 if(column.generated&&(!['int2','int4','int8'].includes(column.nativeType.kind)||column.default!==undefined||field.nullability!=='required'))ctx.add('TABLES_IDENTITY',path+'/generated','Identity requires a required integer column without another default');
 ctx.visit('table-allowed-values',path+'/allowedValues',(field.allowedValues??[]).length);for(const [i,value] of (field.allowedValues??[]).entries())inspectStoredLiteral(column,field,value,ctx,path+'/allowedValues/'+i);
 if(column.default?.kind==='literal')inspectStoredLiteral(column,field,column.default.value,ctx,path+'/default/value');
 if(field.default){
  let matches=false;try{matches=field.default.on==='missing'&&column.default?.kind==='literal'&&literalIdentity(field,field.default.value)===literalIdentity(field,column.default.value);}catch(error){if(!(error instanceof UmfError))throw error;}
  if(!matches)ctx.add('TABLES_LOGICAL_DEFAULT',path+'/default','Logical and native defaults require an explicit matching missing-only literal; other default behavior is not qualified',true);
 }
 if(column.default?.kind==='randomUuid'&&column.nativeType.kind!=='uuid')ctx.add('TABLES_DEFAULT',path+'/default','Random UUID requires UUID storage');
 if(column.default?.kind==='currentTimestamp'&&column.nativeType.kind!=='timestamptz')ctx.add('TABLES_DEFAULT',path+'/default','Current timestamp requires timestamptz; no guessed timezone conversion');
}
export function inspectTable(table:TableDeclaration,payload:TableLifecyclePayload,ctx:TableContext,path:string):void{
 ctx.identifier(table.name,path+'/name');
 const record=ctx.element(table.record);
 if(table.record.module!==ctx.module.id||record?.kind!=='record'){ctx.add('TABLES_RECORD',path+'/record','A table must bind an exact Record in its owning module');return;}
 const members=record.members??[];ctx.visit('table-columns',path+'/columns',table.columns.length);ctx.visit('table-record-members',path+'/record/members',members.length);
 ctx.unique(table.columns,c=>refKey(c.field),path+'/columns','mapped Field');ctx.unique(table.columns,c=>c.name,path+'/columns','native column name');
 for(const[i,column]of table.columns.entries()){
  const p=path+'/columns/'+i;
  if(!members.some(m=>refKey(m)===refKey(column.field)))ctx.add('TABLES_COLUMN_SCOPE',p+'/field','Column is not a member of the bound Record');
  inspectColumn(column,ctx.field(column.field,p+'/field'),ctx,p);
 }
 for(const member of members)if(!table.columns.some(c=>refKey(c.field)===refKey(member)))ctx.add('TABLES_COLUMN_MISSING',path+'/columns','Record member has no native column mapping');
 const keys=record.keys??[];
 for(const column of table.columns)if(column.immutable===false&&keys.some(k=>k.fields.some(f=>refKey(f)===refKey(column.field))))ctx.add('TABLES_KEY_MUTABILITY',path+'/columns','An authored core Key cannot be made mutable by its native mapping');
 if(keys.filter(k=>k.primary).length!==1)ctx.add('TABLES_PRIMARY_KEY',path+'/record','A native lifecycle table requires one explicit primary Key');
 for(const key of keys)for(const ref of key.fields){const field=ctx.field(ref,path+'/record');if(field?.nullability!=='required'||!table.columns.some(c=>refKey(c.field)===refKey(ref)))ctx.add('TABLES_KEY',path+'/record','Native Keys require mapped required singleton fields');}
 ctx.visit('table-key-count',path+'/record/keys',keys.length);ctx.visit('table-index-count',path+'/indexes',table.indexes.length);ctx.visit('table-check-count',path+'/checks',table.checks.length);ctx.visit('table-foreign-key-count',path+'/foreignKeys',table.foreignKeys.length);const fields=table.columns.map(c=>c.field);
 const selected=(refs:readonly TableRef[],location:string)=>{
  ctx.unique(refs,refKey,location,'Field');for(const[i,ref]of refs.entries())if(!fields.some(f=>refKey(f)===refKey(ref)))ctx.add('TABLES_COLUMN_SCOPE',location+'/'+i,'Field is not mapped by this table');
 };
 ctx.unique(table.indexes,i=>i.id,path+'/indexes','index ID');ctx.unique(table.checks,i=>i.id,path+'/checks','check ID');ctx.unique(table.foreignKeys,i=>i.id,path+'/foreignKeys','foreign-key ID');
 const constraints=[...table.checks,...table.foreignKeys];ctx.unique(constraints,c=>c.name,path,'native constraint name');
 for(const[i,index]of table.indexes.entries()){
  const p=path+'/indexes/'+i;ctx.identifier(index.name,p+'/name');selected(index.fields,p+'/fields');selected(index.include,p+'/include');
  if(index.fields.length+index.include.length>32)ctx.add('TABLES_INDEX_WIDTH',p,'PostgreSQL index key/include inventory exceeds 32 columns');
  if(index.include.some(f=>index.fields.some(k=>refKey(f)===refKey(k))))ctx.add('TABLES_INDEX_OVERLAP',p+'/include','Included field overlaps an index key');
 }
 for(const[i,check]of table.checks.entries()){
  const p=path+'/checks/'+i;ctx.identifier(check.name,p+'/name');if(inspectExpression(check.expression,fields,ctx,p+'/expression').kind!=='boolean')ctx.add('TABLES_CHECK_TYPE',p+'/expression','Check expression must have Boolean type');
 }
 for(const[i,fk]of table.foreignKeys.entries()){
  const p=path+'/foreignKeys/'+i;ctx.identifier(fk.name,p+'/name');selected(fk.fields,p+'/fields');
  const target=ctx.element(fk.target.record),key=target?.keys?.find(k=>k.id===fk.target.key);
  if(target?.kind!=='record'||!key||key.fields.length!==fk.fields.length){ctx.add('TABLES_FOREIGN_KEY',p+'/target','Target must be an exact authored Key with matching arity');continue;}
  for(const[j,ref]of fk.fields.entries()){
   const sourceField=ctx.field(ref,p+'/fields/'+j),targetField=ctx.field(key.fields[j]!,p+'/target');
   if(sourceField&&targetField&&domain(sourceField)!==domain(targetField))ctx.add('TABLES_FOREIGN_KEY_TYPE',p+'/fields/'+j,'Foreign-key domains differ');
   if(sourceField?.nullability==='required'&&(fk.onDelete==='setNull'||fk.onUpdate==='setNull'))ctx.add('TABLES_FOREIGN_KEY_NULL',p,'SET NULL requires nullable referencing columns');
  }
  if(!payload.tables.some(t=>refKey(t.record)===refKey(fk.target.record)))ctx.add('TABLES_FOREIGN_KEY_DEPENDENCY',p+'/target','External table installation dependency requires a separately pinned deployment binding',true);
  if(fk.relationship){
   const relation=ctx.document.modules.find(m=>m.id===fk.relationship!.module)?.relationships?.find(r=>r.id===fk.relationship!.id);
   if(fk.relationship.module!==ctx.module.id||!relation||relation.source.length!==1||relation.target.length!==1||refKey(relation.source[0]!)!==refKey(table.record)||refKey(relation.target[0]!)!==refKey(fk.target.record)||(relation.target[0] as any).key!==fk.target.key)ctx.add('TABLES_FOREIGN_KEY_RELATIONSHIP',p+'/relationship','Original relationship endpoints/Key differ from the native foreign key');
  }
 }
}

export function inspectStoredLiteral(column:TableColumn,field:Element,value:any,ctx:TableContext,path:string):void{
 ctx.literal(field,value,path);if(value===null)return;
 try{
  const type=column.nativeType;
  if('integerToken'in value&&['int2','int4','int8'].includes(type.kind)){
   const number=schemaCoefficient(value.integerToken,0),bits=type.kind==='int2'?16n:type.kind==='int4'?32n:64n;
   if(number<-(1n<<(bits-1n))||number>=(1n<<(bits-1n)))ctx.add('TABLES_NATIVE_CAPACITY',path,'Integer exceeds native signed width');
  }
  if('decimalToken'in value&&type.kind==='numeric')schemaCoefficient(value.decimalToken,type.scale,type.precision);
  if('string'in value){
   if(value.string.includes('\0'))ctx.add('TABLES_NATIVE_STRING',path,'PostgreSQL text cannot store NUL');
   if((type.kind==='varchar'||type.kind==='char')&&[...value.string].length>type.length)ctx.add('TABLES_NATIVE_CAPACITY',path,'String exceeds native character capacity');
  }
 }catch(error){if(!(error instanceof UmfError))throw error;ctx.add('TABLES_NATIVE_CAPACITY',path,error.message);}
}
