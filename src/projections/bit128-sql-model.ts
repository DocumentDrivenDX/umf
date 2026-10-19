// SPDX-License-Identifier: MIT OR Apache-2.0
import {encodeModelScalar,scalarSqlType} from '../extensions/binding/model-scalar';
import type {Document} from '../model/types';
import {UmfError} from '../model/types';
import type {Resolved128Layout,Resolved128Field,Resolved128Record} from '../extensions/binding/bit128-layout';
import {encodeBit128CarrierValue} from '../extensions/binding/bit128';
import type {CoreLiteral} from '../model/schema-literals';
export const bit128SqlServerSessionStatements=Object.freeze(['SET ANSI_NULLS ON;','SET QUOTED_IDENTIFIER ON;','SET ANSI_PADDING ON;','SET ANSI_WARNINGS ON;','SET ARITHABORT ON;','SET CONCAT_NULL_YIELDS_NULL ON;','SET NUMERIC_ROUNDABORT OFF;']);
export interface Bit128ModelResidual {path:string;reason:string}
export const carrierSqlName=(name:string,system:string)=>{
 if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)||name.length>(system==='postgresql'?63:128))throw new UmfError('BIT128_IDENTIFIER','Model profile requires bounded ASCII native identifiers');
 return system==='postgresql'?'"'+name+'"':'['+name+']';
};
/** Native DDL only. Values are validated and quoted; arbitrary SQL is never accepted. */
export function renderBit128SqlModel(layout:Resolved128Layout,binding:Document,source:Document,system:'postgresql'|'sqlserver',residuals:Bit128ModelResidual[]):string {
 const pg=system==='postgresql',q=(n:string)=>carrierSqlName(n,system),statements:string[]=pg?[]:[...bit128SqlServerSessionStatements];
 const names=new Set<string>();
 const reserve=(n:string)=>{q(n);const k=pg?n:n.toLowerCase();if(names.has(k))throw new UmfError('BIT128_IDENTIFIER','Native object names collide');names.add(k);};
 for(const r of layout.records)reserve(r.table);
 const slots=(fields:Resolved128Field[])=>fields.flatMap(f=>f.slots);
 const terms=(fields:Resolved128Field[])=>slots(fields).map(q).join(', ');
 const knownLiteral=(f:Resolved128Field,literal:CoreLiteral)=>{
  const encoded=f.carrier.kind==='scalar'?{[f.carrier.column]:encodeModelScalar(source,f.identity,f.field,literal)}:encodeBit128CarrierValue(binding,source,f.identity,literal);
  return f.slots.map(n=>{const token=encoded[n];if(token===null)return 'NULL';if(typeof token!=='string')throw new UmfError('BIT128_SQL_VALUE','Missing native token');
   if(f.carrier.kind==='words64')return token;
   if(f.carrier.kind==='json')throw new UmfError('MODEL_DEFAULT','Composite defaults need a separately qualified expression');
   if(f.carrier.kind==='scalar'){if(f.field.scalarType==='boolean')return pg?token:token==='true'?'1':'0';if(['integer','decimal'].includes(f.field.scalarType!))return "'"+token+"'";if(f.field.scalarType==='binary')return pg?`decode('${token}','hex')`:'0x'+token;return (pg?'': 'N')+"'"+token.replaceAll("'","''")+"'";}
   if(f.carrier.kind==='bytes16')return pg?`decode('${token}','hex')`:'0x'+token;
   return "'"+token.replaceAll("'","''")+"'";
  });
 };
 const indexBytes=(f:Resolved128Field):number=>{if(f.carrier.kind==='json')throw new UmfError('MODEL_KEY_WIDTH','Composite document indexes require an explicit path profile');if(f.carrier.kind!=='scalar')return f.carrier.kind==='uuid-text'?74:f.carrier.kind==='hex128-text'?66:16;const facets=f.field.facets as any;if(['string','binary'].includes(f.field.scalarType!)){if(!Number.isSafeInteger(facets?.length?.max))throw new UmfError('MODEL_KEY_WIDTH','Indexed strings/binary require bounded lengths');return Math.max(1,facets.length.max)*(f.field.scalarType==='string'?4:1);}if(!['boolean','integer','decimal'].includes(f.field.scalarType!))throw new UmfError('MODEL_KEY_WIDTH','Lexical float/temporal tokens have no qualified index equality');return f.field.scalarType==='integer'&&facets.integerWidth.bits>63?40:17;};
 const emitUnique=(record:Resolved128Record,fields:Resolved128Field[],name:string,primary=false)=>{
  fields.forEach(indexBytes);reserve(name);for(const f of fields)if(f.carrier.kind==='scalar'&&['string','binary'].includes(f.field.scalarType!)&&!(f.field.facets as any)?.length?.max)throw new UmfError('MODEL_KEY_WIDTH','String/binary keys require bounded length');if(slots(fields).length>16||!pg&&fields.reduce((n,f)=>n+indexBytes(f),0)>900)throw new UmfError('BIT128_KEY_WIDTH','Key/index exceeds conservative16-column limit');
  const nullable=fields.some(f=>f.field.nullability!=='required');
  if(primary&&nullable)throw new UmfError('BIT128_KEY_NULL','Primary Key requires nonnull Fields');
  if(primary||!nullable)statements.push(`ALTER TABLE ${q(record.table)} ADD CONSTRAINT ${q(name)} ${primary?'PRIMARY KEY':'UNIQUE'}${pg?'':' NONCLUSTERED'} (${terms(fields)});`);
  else statements.push(`CREATE UNIQUE INDEX ${q(name)} ON ${q(record.table)} (${terms(fields)}) WHERE ${slots(fields).map(n=>q(n)+' IS NOT NULL').join(' AND ')};`);
 };
 for(const [ri,r] of layout.records.entries()){
  const defs:string[]=[],columnNames=new Set<string>();
  for(const f of r.fields){
   const c=f.carrier,required=f.field.nullability==='required';
   if(c.kind==='words64'&&!c.signed)throw new UmfError('BIT128_SQL_UNSIGNED','Native bigint does not admit unsigned64 words');
   const type=c.kind==='json'?(pg?'jsonb':'nvarchar(max)'):c.kind==='scalar'?scalarSqlType(f.field,pg):c.kind==='words64'?'bigint':c.kind==='native-uuid'?(pg?'uuid':'uniqueidentifier'):c.kind==='bytes16'?(pg?'bytea':'varbinary(17)'):(pg?'text':`nvarchar(${c.kind==='uuid-text'?37:33}) COLLATE Latin1_General_100_BIN2`);
   const defaultValue=f.field.default as {on:string;value:CoreLiteral}|undefined;
   if(defaultValue&&defaultValue.on!=='missing')residuals.push({path:JSON.stringify(f.identity)+'/default',reason:'SQL DEFAULT does not replace explicitly supplied NULL'});
   const defaults=defaultValue?knownLiteral(f,defaultValue.value):undefined;
   for(const [i,n] of f.slots.entries()){
    q(n);const k=pg?n:n.toLowerCase();if(columnNames.has(k))throw new UmfError('BIT128_SLOT_COLLISION','Case-folded native column collision');columnNames.add(k);
    defs.push(`${q(n)} ${type}${required?' NOT NULL':' NULL'}${defaults?' DEFAULT '+defaults[i]:''}`);
   }
   if(c.kind==='json'){if(!pg)defs.push(`CHECK (ISJSON(${q(c.column)}) = 1)`);residuals.push({path:JSON.stringify(f.identity),reason:'JSON composite storage preserves structure; recursive domains, bounds, group presence and pair integrity require complete-value codec validation'});}
   if(c.kind==='bytes16')defs.push(`CHECK (${pg?'octet_length':'DATALENGTH'}(${q(c.column)}) = 16)`);
   if(c.kind==='words64'&&!required)defs.push(`CHECK ((${q(c.highColumn)} IS NULL AND ${q(c.lowColumn)} IS NULL) OR (${q(c.highColumn)} IS NOT NULL AND ${q(c.lowColumn)} IS NOT NULL))`);
   if(c.kind==='uuid-text'||c.kind==='hex128-text'){
    const col=q(c.column),uuid=c.kind==='uuid-text',len=uuid?36:32;
    if(pg)defs.push(`CHECK (octet_length(${col}) = ${len} AND ${col} ~ '${uuid?'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$':'^[0-9a-f]{32}$'}')`);
    else{
     const plain=uuid?`REPLACE(${col},'-','')`:col;
     const hyphens=uuid?` AND SUBSTRING(${col},9,1) = '-' AND SUBSTRING(${col},14,1) = '-' AND SUBSTRING(${col},19,1) = '-' AND SUBSTRING(${col},24,1) = '-' AND DATALENGTH(${plain}) = 64`:'';
     defs.push(`CHECK (DATALENGTH(${col}) = ${len*2} AND ${plain} NOT LIKE '%[^0-9a-f]%' COLLATE Latin1_General_100_BIN2${hyphens})`);
    }
   }
   if(c.kind==='scalar')residuals.push({path:JSON.stringify(f.identity),reason:'Mixed scalar facets, equality/collation and ordering require portable codec checks; native type is not full semantic equivalence'});
   if(f.field.facets!==undefined)residuals.push({path:JSON.stringify(f.identity)+'/facets',reason:'Unqualified refinements retained'});
   if(f.field.allowedValues!==undefined){
    const allowed=f.field.allowedValues as CoreLiteral[];
    const clauses=allowed.map(v=>knownLiteral(f,v).map((token,i)=>token==='NULL'?`${q(f.slots[i]!)} IS NULL`:`${q(f.slots[i]!)} = ${token}`).join(' AND '));
    defs.push(`CHECK (${clauses.length?clauses.map(s=>'('+s+')').join(' OR '):required?'1 = 0':f.slots.map(n=>q(n)+' IS NULL').join(' AND ')})`);
   }
  }
  statements.push(`CREATE TABLE ${q(r.table)} (\n  ${defs.join(',\n  ')}\n);`);
  // Keys are emitted after all tables, permitting cyclic foreign keys.
  void ri;
 }
 for(const [ri,r] of layout.records.entries())for(const [ki,k] of r.keys.entries())emitUnique(r,k.fields.map(ref=>r.fields.find(f=>f.identity.module===ref.module&&f.identity.element===ref.element)!),`umf_key_${ri}_${ki}`,k.primary===true);
 for(const [i,{index,record,fields}] of layout.indexes.entries()){
  if(index.unique||index.kind==='unique')emitUnique(record,fields,index.name);
  else{fields.forEach(indexBytes);reserve(index.name);if(slots(fields).length>16||!pg&&fields.reduce((n,f)=>n+indexBytes(f),0)>900)throw new UmfError('BIT128_KEY_WIDTH','Index exceeds conservative column limit');statements.push(`CREATE INDEX ${q(index.name)} ON ${q(record.table)} (${terms(fields)});`);}
  void i;
 }
 for(const [i,r] of layout.relationships.entries()){
  const d=r.declaration,path=`/relationships/${r.layout.module}/${r.layout.id}`;
  if(d.targetMultiplicity.max!==1)throw new UmfError('BIT128_RELATIONSHIP_LAYOUT','To-many targets require an explicit association Record, not a foreign-key rewrite');
  const allSlots=slots(r.sourceFields);
  if(r.sourceFields[0]!.field.nullability!=='required')statements.push(`ALTER TABLE ${q(r.source.table)} ADD CHECK ((${allSlots.map(n=>q(n)+' IS NULL').join(' AND ')}) OR (${allSlots.map(n=>q(n)+' IS NOT NULL').join(' AND ')}));`);
  if(d.targetMultiplicity.min===1&&r.sourceFields.some(f=>f.field.nullability!=='required'))residuals.push({path,reason:'Nullable source Fields cannot establish required target participation'});
  const constraint='umf_fk_'+i;reserve(constraint);
  statements.push(`ALTER TABLE ${q(r.source.table)} ${pg?'':'WITH CHECK '}ADD CONSTRAINT ${q(constraint)} FOREIGN KEY (${terms(r.sourceFields)}) REFERENCES ${q(r.target.table)} (${terms(r.targetFields)}) ON DELETE NO ACTION ON UPDATE NO ACTION;`);
  if(d.sourceMultiplicity.max===1)emitUnique(r.source,r.sourceFields,'umf_reverse_'+i);
  if(d.sourceMultiplicity.max!=='*'&&d.sourceMultiplicity.max!==1)residuals.push({path,reason:'Finite reverse participation bound is not enforced by the foreign key'});
  if(d.sourceMultiplicity.min>0)residuals.push({path,reason:'Every target having a source requires consumer transaction enforcement'});
  if(d.targetLifecycle!=='unspecified')residuals.push({path,reason:'NO ACTION does not establish authored lifecycle/ownership semantics'});
 }
 for(const {layout:a,declaration:d} of layout.associations??[]){
  const r=layout.records.find(r=>r.identity.module===a.record.module&&r.identity.element===a.record.element)!;
  for(const side of ['source','target'] as const){const ends=a[side].map(end=>end.fields.flatMap(ref=>r.fields.find(f=>f.identity.module===ref.module&&f.identity.element===ref.element)!.slots));
   statements.push(`ALTER TABLE ${q(r.table)} ADD CHECK (`+ends.map((names,i)=>'('+ends.map((other,j)=>other.map(n=>q(n)+(i===j?' IS NOT NULL':' IS NULL')).join(' AND ')).join(' AND ')+')').join(' OR ')+');');}
  residuals.push({path:'/relationships/'+a.module+'/'+a.id,reason:'Association endpoint existence and exclusive alternatives are native constraints; distinct-endpoint multiplicity, inverse presentation and lifecycle require portable dataset/consumer validation'});
  void d;
 }
 return statements.join('\n')+'\n';
}
