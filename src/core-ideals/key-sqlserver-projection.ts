import {copyJson} from '../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../model/types';
import {lookupCoreKey,verifyCoreKeyOperation,type CoreKeyDeclaration,type CoreRecordIdentity} from '../model/keys';
import type {CoreKeyDefinition,CoreKeyFieldReference} from '../validation/keys';
import {validateDocument} from '../validation/document';
import {sqlServerKeyCarriers as carriers,sqlServerKeySessionOptions} from './key-sqlserver-carriers';
import {sqlServerIdentifier as identifier} from './sqlserver-syntax';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import nullability from '../../spec/core/nullability-document.schema.json';import cardinality from '../../spec/core/cardinality-document.schema.json';import facets from '../../spec/core/facet-document.schema.json';import keys from '../../spec/core/key-document.schema.json';import keyOperation from '../../spec/core/key-operation.schema.json';
import schema from '../../spec/core/key-sqlserver-projection.schema.json';
export {default as keySqlServerProjectionSchema} from '../../spec/core/key-sqlserver-projection.schema.json';
export interface KeySqlServerRequest {
 id:string;record:CoreRecordIdentity;namespace:string;tableName:string;scope:'new-table-stored-values';keyNames:{keyId:string;name:string}[];mode:'strict'|'report';
 columns:{field:CoreRecordIdentity;name:string;nativeType:keyof typeof carriers;nativeSize?:number;encoding?:{bytesColumn:string;lengthColumn:string}}[];
}
const binding=schema.properties.binding.const;
const recovery='Recover authored source from retained receipt; native import alone does not recover authored identity' as const;
export interface KeySqlServerProjection {
 operation:'project-keys-sqlserver';version:'1.0.0';status:'projected'|'blocked';source:Document;authors:CoreKeyDeclaration[];request:KeySqlServerRequest;binding:typeof binding;requiredSessionOptions:typeof sqlServerKeySessionOptions;target?:{format:'sqlserver-ddl';sql:string};nativeSql?:string;
 mappings:{keyId:string;keyName:string;idealPath:string;nativePath:string;columns:string[];nativeColumns:string[];primary:boolean;constraintName:string;origin:'authored';enforcement:'primary-key-not-null'|'unique-not-null';equality:'exact-on-representable-values'|'unknown';outcome:'not-expressible'}[];
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
const validator=createValidator(false);for(const s of [legacy,fields,nullability,cardinality,facets,keys,keyOperation])validator.addSchema(s);
const check=validator.compile(schema),requestCheck=validator.compile(schema.properties.request);
const canonical=(v:Json):string=>Array.isArray(v)?'a['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'o{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);
const same=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));
const identity=(r:CoreRecordIdentity)=>JSON.stringify([r.module,r.element]);
function locate(source:Document,ref:CoreRecordIdentity){const mi=source.modules.findIndex(m=>m.id===ref.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===ref.element)??-1;if(mi<0||ei<0)throw new UmfError('KEY_SQLSERVER_REFERENCE','Unresolved element identity');return {element:source.modules[mi]!.elements[ei]!,path:`/modules/${mi}/elements/${ei}`};}
/** Consume verified declarations by stable ID. Native names never supply authored identity. */
export function projectKeysToSqlServer(input:Document,authorInput:CoreKeyDeclaration[],options:KeySqlServerRequest):KeySqlServerProjection {
 const source=copyJson(input) as unknown as Document,authors=copyJson(authorInput) as unknown as CoreKeyDeclaration[],request=copyJson(options) as unknown as KeySqlServerRequest;
 if(!requestCheck(request))throw new UmfError('KEY_SQLSERVER_REQUEST',JSON.stringify(requestCheck.errors));
 const validation=validateDocument(source);
 if(source.umf!=='0.6.0'||!validation.valid)throw new UmfError('KEY_SQLSERVER_SOURCE','Valid explicit core 0.6.0 required');
 const record=locate(source,request.record),declared=record.element.keys as CoreKeyDefinition[]|undefined,members=record.element.members as CoreKeyFieldReference[]|undefined;
 if(record.element.kind!=='record'||!declared?.length||!members?.length)throw new UmfError('KEY_SQLSERVER_RECORD','Selected Record must have authored keys and explicit membership');
 if(!Array.isArray(authors)||authors.length!==declared.length)throw new UmfError('KEY_SQLSERVER_AUTHORS','Exactly one verified declaration for every current key is required');
 const seen=new Set<string>();
 for(const author of authors){
  if(author.operation!=='declare-core-key')throw new UmfError('KEY_SQLSERVER_AUTHORS','Expected key declarations');
  verifyCoreKeyOperation(author,author.target);
  if(author.target.id!==source.id||identity(author.identity)!==identity(request.record)||seen.has(author.request.id))throw new UmfError('KEY_SQLSERVER_AUTHORS','Duplicate or mismatched author identity');seen.add(author.request.id);
  const current=lookupCoreKey(source,{...request.record,key:author.request.id}),prior=lookupCoreKey(author.target,{...request.record,key:author.request.id});
  if(!same(current.key,prior.key))throw new UmfError('KEY_SQLSERVER_STALE','Key meaning changed since declaration');
  // Unrelated later key declarations/list ordering may differ; component meaning may not.
  for(const ref of current.key.fields)if(!same(locate(source,ref).element,locate(author.target,ref).element))throw new UmfError('KEY_SQLSERVER_STALE','Key component changed since declaration');
  const priorMembers=locate(author.target,request.record).element.members as CoreKeyFieldReference[];
  for(const ref of current.key.fields){const now=members.find(m=>identity(m)===identity(ref)),then=priorMembers.find(m=>identity(m)===identity(ref));if(!same(now,then))throw new UmfError('KEY_SQLSERVER_STALE','Key ownership qualifier changed since declaration');}
 }
 const mapped=new Map<string,KeySqlServerRequest['columns'][number]>(),names=new Set<string>();
 for(const column of request.columns){const id=identity(column.field);if(mapped.has(id)||names.has(column.name)||!members.some(m=>identity(m)===id))throw new UmfError('KEY_SQLSERVER_COLUMNS','Column identities and names must be unique and owned by the selected Record');mapped.set(id,column);names.add(column.name);}
 if(mapped.size!==members.length)throw new UmfError('KEY_SQLSERVER_COLUMNS','Map every owned Field explicitly');
 const result:KeySqlServerProjection={operation:'project-keys-sqlserver',version:'1.0.0',status:'projected',source,authors,request,binding,requiredSessionOptions:sqlServerKeySessionOptions,mappings:[],residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'='not-expressible')=>result.residuals.push({path,value:copyJson(value),reason,outcome,recovery});
 // The receipt is the explicit residual for context outside this Key-only lowering.
 loss('/',source,'Only selected Record column carriers and key tuple declarations are emitted; all other metadata, native extensions, relationships and unknown content remain in this source residual');
 const namespace=identifier(request.namespace),tableName=identifier(request.tableName);
 // Collision checks are conservative; deployment still requires the stated native naming context.
 const nameKey=(name:string)=>name.normalize('NFKC').toUpperCase(),physicalNames=new Set<string>();
 const reserve=(name:string)=>{identifier(name);const k=nameKey(name);if(physicalNames.has(k))throw new UmfError('KEY_SQLSERVER_NAMES','Physical columns collide under the case/width-insensitive naming profile');physicalNames.add(k);};
 for(const column of request.columns)reserve(column.name);
 const nativeNames=new Map<string,string>(),constraintNames=new Set<string>();
 for(const entry of request.keyNames){identifier(entry.name);const k=nameKey(entry.name);if(nativeNames.has(entry.keyId)||constraintNames.has(k)||!declared.some(key=>key.id===entry.keyId))throw new UmfError('KEY_SQLSERVER_NAMES','Bind each stable key ID once to a distinct constraint name');nativeNames.set(entry.keyId,entry.name);constraintNames.add(k);}
 if(nativeNames.size!==declared.length)throw new UmfError('KEY_SQLSERVER_NAMES','Missing native key name');
 const keyed=new Set(declared.flatMap(k=>k.fields.map(identity))),physical=new Map<string,{columns:string[];bytes:number}>(),definitions:string[]=[];let impossible=false;
 const widths:Record<string,number>={tinyint:8,smallint:16,int:32,bigint:64};
 for(const column of request.columns){
  const field=locate(source,column.field),e=field.element,name=identifier(column.name),family=carriers[column.nativeType],numericInteger=column.nativeType==='decimal'&&e.scalarType==='integer',id=identity(column.field);
  if((e.scalarType!==family&&!numericInteger)||e.kind!=='field'||e.cardinality!=='one'||e.itemType!==undefined||e.references?.some(r=>r.role==='record-type')){impossible=true;loss(field.path,e,'Selected scalar carrier conflicts with Field family or shape');continue;}
  const checks:string[]=[],f=e.facets as {length?:{max:number;unit:string};integerWidth?:{bits:number;signed:boolean};precision?:number;scale?:number}|undefined;
  let type:string=column.nativeType,bytes=({bit:1,tinyint:1,smallint:2,int:4,bigint:8,decimal:17,real:4,float:8,date:3,time:5,datetime2:8,datetimeoffset:10} as Record<string,number>)[type]??0;
  const variable=type==='nvarchar'||type==='varbinary';
  if(variable){
   const max=type==='nvarchar'?4000:8000;if(column.nativeSize===undefined||column.nativeSize>max){impossible=true;loss(field.path,e,'Explicit bounded nativeSize is required: at most 4000 UTF-16 units or 8000 bytes');continue;}
   bytes=column.nativeSize*(type==='nvarchar'?2:1);type+=`(${column.nativeSize})`;
   if(column.nativeType==='nvarchar')type+=' COLLATE Latin1_General_100_CI_AS_SC';
  }else if(column.nativeSize!==undefined||column.encoding!==undefined){impossible=true;loss(field.path,column,'Size and binary-plus-length encoding apply only to string/binary carriers');continue;}
  if(column.nativeType==='decimal'){
   if(numericInteger)type='decimal(38,0)';
   else if(f?.precision!==undefined&&f.scale!==undefined&&f.precision<=38){type=`decimal(${f.precision},${f.scale})`;bytes=f.precision<=9?5:f.precision<=19?9:f.precision<=28?13:17;}
   else{impossible=true;loss(field.path,e,'Decimal carrier requires explicit precision and scale within 38 digits');continue;}
  }
  if(f?.integerWidth){
   const {bits,signed}=f.integerWidth;
   if(bits>127){impossible=true;loss(field.path+'/facets/integerWidth',f.integerWidth,'Integer width exceeds the qualified 38-digit native domain');}
   else {const min=signed?-(1n<<BigInt(bits-1)):0n,max=(1n<<BigInt(bits-(signed?1:0)))-1n,nativeBits=widths[column.nativeType];
    const nativeMin=numericInteger?-(10n**38n)+1n:nativeBits===undefined?undefined:column.nativeType==='tinyint'?0n:-(1n<<BigInt(nativeBits-1)),nativeMax=numericInteger?10n**38n-1n:nativeBits===undefined?undefined:(1n<<BigInt(column.nativeType==='tinyint'?nativeBits:nativeBits-1))-1n;
    if(nativeMin===undefined||nativeMax===undefined||min<nativeMin||max>nativeMax){impossible=true;loss(field.path+'/facets/integerWidth',f.integerWidth,'Selected native carrier cannot contain the authored integer domain');}
    else checks.push(`${name} >= ${min}`,`${name} <= ${max}`);
   }
  }
  if(f?.length){
   if(column.nativeType==='varbinary'&&f.length.unit==='byte')checks.push(`DATALENGTH(${name}) <= ${f.length.max}`);
   else if(column.nativeType==='nvarchar'&&f.length.unit==='unicode-scalar')checks.push(`LEN(CONVERT(nvarchar(max),${name})+N'x')-1 <= ${f.length.max}`);
   else{impossible=true;loss(field.path+'/facets/length',f.length,'Selected carrier does not honor the stated length unit');}
  }
  if(f?.precision!==undefined&&column.nativeType!=='decimal'){impossible=true;loss(field.path+'/facets',f,'Precision and scale require decimal storage');}
  if(e.nullability!=='required')loss(field.path+'/nullability',e.nullability??null,'SQL NULL does not establish absent-member availability');
  definitions.push(`${name} ${type}${e.nullability==='required'?' NOT NULL':' NULL'}${checks.length?' CHECK ('+checks.join(' AND ')+')':''}`);
  if(variable&&keyed.has(id)&&!column.encoding){impossible=true;loss(field.path,e,'String/binary key components require explicit binary-plus-length physical columns; direct native equality collapses padding');}
  if(column.encoding){
   reserve(column.encoding.bytesColumn);reserve(column.encoding.lengthColumn);
   if(e.nullability!=='required'){impossible=true;loss(field.path,e,'Computed required key encoding requires a required source Field');}
   definitions.push(`${identifier(column.encoding.bytesColumn)} AS CONVERT(varbinary(${bytes}),${name}) PERSISTED NOT NULL`,`${identifier(column.encoding.lengthColumn)} AS DATALENGTH(${name}) PERSISTED NOT NULL`);
   physical.set(id,{columns:[column.encoding.bytesColumn,column.encoding.lengthColumn],bytes:bytes+4});
  }else physical.set(id,{columns:[column.name],bytes});
  loss(field.path,e,'Native bounds, UTF-16 validity, decimal rounding and other SQL input conversions remain residuals; stored-value equality does not establish exact conversion or full ideal domain coverage','unknown');
 }
 if(physicalNames.size>1024||declared.length>999){impossible=true;loss('/request',request,'Qualified table/index count limit exceeded');}
 loss('/requiredSessionOptions',sqlServerKeySessionOptions,'Required session options must also hold for subsequent writes to indexed computed columns; generated DDL does not configure future callers');
 for(const key of declared){
  const current=lookupCoreKey(source,{...request.record,key:key.id}),columns=key.fields.map(ref=>mapped.get(identity(ref))!.name),encoded=key.fields.map(ref=>physical.get(identity(ref))),nativeColumns=encoded.flatMap((p,i)=>p?.columns??[columns[i]!]),primary=key.primary===true,constraintName=nativeNames.get(key.id)!;
  if(nativeColumns.length>32||encoded.reduce((n,p)=>n+(p?.bytes??0),0)>(primary?900:1700)){impossible=true;loss(current.path,key,'Expanded physical key exceeds the qualified 32-column or primary/alternate byte budget');}
  const relevant=[current.path,...key.fields.flatMap(ref=>[locate(source,ref).path+'/facets',record.path+'/members/'+members.findIndex(m=>identity(m)===identity(ref))])],unknownEquality=validation.diagnostics.some(d=>['UNKNOWN_KEY_QUALIFIER','UNKNOWN_FACET','UNKNOWN_FACET_UNIT'].includes(d.code)&&relevant.some(p=>d.path===p||d.path.startsWith(p+'/')));
  definitions.push(`CONSTRAINT ${identifier(constraintName)} ${primary?'PRIMARY KEY':'UNIQUE'} NONCLUSTERED (${nativeColumns.map(identifier).join(', ')}) WITH (IGNORE_DUP_KEY=OFF)`);
  result.mappings.push({keyId:key.id,keyName:key.name,idealPath:current.path,nativePath:'/sql',columns,nativeColumns,primary,constraintName,origin:'authored',enforcement:primary?'primary-key-not-null':'unique-not-null',equality:unknownEquality?'unknown':'exact-on-representable-values',outcome:'not-expressible'});
  loss(current.path,key,unknownEquality?'Unknown selected qualifiers prevent exact equality claims; native constraints express only known assertions':'Native constraints do not carry stable UMF key IDs, names or author intent; known equality covers representable stored values only');
 }
 if(impossible||request.mode==='strict')result.status='blocked';
 else {result.nativeSql=Object.entries(sqlServerKeySessionOptions).map(([k,v])=>`SET ${k} ${v};`).join('\n')+`\nCREATE TABLE ${namespace}.${tableName} (\n  ${definitions.join(',\n  ')}\n);\n`;result.target={format:'sqlserver-ddl',sql:result.nativeSql};}
 result.diagnostics=result.residuals.map(r=>({code:'KEY_SQLSERVER_LOSS',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const copied=copyJson(result);if(!check(copied))throw new UmfError('KEY_SQLSERVER_RESULT',JSON.stringify(check.errors));return copied as unknown as KeySqlServerProjection;
}
/** Recompute projection and match current native representation; not source authentication. */
export function verifyKeysSqlServerProjection(input:KeySqlServerProjection,current:{format:'sqlserver-ddl';sql:string}):KeySqlServerProjection {
 const receipt=copyJson(input) as unknown as KeySqlServerProjection;
 if(!check(receipt)||receipt.status!=='projected')throw new UmfError('KEY_SQLSERVER_RECEIPT','Expected complete successful projection receipt');
 const expected=projectKeysToSqlServer(receipt.source,receipt.authors,receipt.request);
 if(!same(receipt,expected))throw new UmfError('KEY_SQLSERVER_RECEIPT','Receipt differs from retained author/source/request');
 if(!same(current,receipt.target)||current.sql!==receipt.nativeSql)throw new UmfError('KEY_SQLSERVER_STALE','Native representation changed since projection');return receipt;
}
export function recoverKeysSqlServerIdeal(input:KeySqlServerProjection,current:{format:'sqlserver-ddl';sql:string}):Document{return copyJson(verifyKeysSqlServerProjection(input,current).source) as unknown as Document;}
