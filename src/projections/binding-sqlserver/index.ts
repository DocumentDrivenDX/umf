import {copyJson} from '../../model/json';
import {UmfError,type Document,type Json,type Diagnostic} from '../../model/types';
import {getBinding} from '../../extensions/binding';
import {importSqlServerCatalog} from '../../adapters/sqlserver';
import {sqlServerIdentifier as quote,sqlServerLiteral as literal} from '../../core-ideals/sqlserver-syntax';
import {projectBindingTablesToSqlServer,type SqlServerPartitionFamily} from './tables';
import {projectBindingIndexesAgainstSqlServerPlan,type SqlServerPlannedColumn} from './indexes';
import {validateSqlServerRelationshipLayout,type SqlServerRelationshipLayoutPolicy,type SqlServerLayoutKey,type SqlServerLayoutType,type SqlServerLayoutEndpointComponent} from './relationship-layout';
import {createValidator} from '../../validation/schema';
import legacy from '../../../spec/core/schema.json';import fields from '../../../spec/core/field-document.schema.json';import nullability from '../../../spec/core/nullability-document.schema.json';import cardinality from '../../../spec/core/cardinality-document.schema.json';import facets from '../../../spec/core/facet-document.schema.json';import keys from '../../../spec/core/key-document.schema.json';import relationships from '../../../spec/core/relationship-document.schema.json';
import layoutSchema from '../../../spec/projections/sqlserver-relationship-layout.schema.json';import schema from '../../../spec/projections/sqlserver-physical-binding.schema.json';
export {default as sqlserverPhysicalBindingSchema} from '../../../spec/projections/sqlserver-physical-binding.schema.json';
export interface SqlServerPhysicalPolicy {layout:SqlServerRelationshipLayoutPolicy;partitionFamilies:SqlServerPartitionFamily[]}
export interface SqlServerPhysicalProjection {operation:'project-binding-sqlserver';version:'1.0.0';status:'reported'|'blocked';logical:Document;binding:Document;policy:SqlServerPhysicalPolicy;lossPolicy:'strict'|'report';nativeSource?:string;nativeArchive?:Document;candidate?:string;residuals:{source:'logical'|'binding'|'policy'|'native';path:string;reason:string;value:Json}[];mappings:{sourcePath:string;target:string;kind:'table'|'column'|'key'|'relationship'|'index';outcome:'approximated'|'unknown'}[];diagnostics:Diagnostic[]}
const validator=createValidator(false);for(const s of [legacy,fields,nullability,cardinality,facets,keys,relationships,layoutSchema])validator.addSchema(s);const check=validator.compile(schema),policyCheck=validator.compile(schema.properties.policy);
const canonical=(v:Json):string=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v!==null&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k]!)).join(',')+'}':JSON.stringify(v);const same=(a:unknown,b:unknown)=>canonical(copyJson(a))===canonical(copyJson(b));
const qualified=(name:string)=>{const p=name.split('.');if(p.length!==2)throw new UmfError('SQLSERVER_PHYSICAL_TABLE','Exact schema.table required');return p.map(quote).join('.');};
const id=(ref:{module:string;element:string})=>JSON.stringify([ref.module,ref.element]),kid=(ref:{module:string;element:string;key:string})=>JSON.stringify([ref.module,ref.element,ref.key]);
const tuple=(names:string[])=>names.map(quote).join(', ');
const type=(f:SqlServerLayoutType)=>f.sqlType+(f.collation?' COLLATE '+f.collation:'')+(f.nullable?' NULL':' NOT NULL');
function maximumBytes(sql:string):number {
 const widths:Record<string,number>={bit:1,tinyint:1,smallint:2,int:4,bigint:8,date:3};if(widths[sql])return widths[sql]!;
 const n=/^(nvarchar|varbinary)\((max|[0-9]+)\)$/.exec(sql);if(n)return n[2]==='max'?Infinity:Number(n[2])*(n[1]==='nvarchar'?2:1);
 const d=/^decimal\(([0-9]+),/.exec(sql);if(d){const p=Number(d[1]);return p<=9?5:p<=19?9:p<=28?13:17;}
 return sql.startsWith('datetimeoffset')?10:8;
}
/** Compose complete qualified table, Key, relationship and index DDL without executing it. */
export function projectBindingToSqlServer(logicalInput:Document,bindingInput:Document,policyInput:SqlServerPhysicalPolicy,lossPolicy:'strict'|'report',nativeSource?:string):SqlServerPhysicalProjection {
 const logical=copyJson(logicalInput) as unknown as Document,binding=copyJson(bindingInput) as unknown as Document,policy=copyJson(policyInput) as unknown as SqlServerPhysicalPolicy;
 if(!policyCheck(policy)||!['strict','report'].includes(lossPolicy)||nativeSource!==undefined&&typeof nativeSource!=='string')throw new UmfError('SQLSERVER_PHYSICAL_REQUEST','Malformed explicit policy or loss mode');
 const result:SqlServerPhysicalProjection={operation:'project-binding-sqlserver',version:'1.0.0',status:'blocked',logical,binding,policy,lossPolicy,residuals:[],mappings:[],diagnostics:[],...(nativeSource===undefined?{}:{nativeSource,nativeArchive:importSqlServerCatalog(nativeSource,{id:'sqlserver-physical-native-archive'})})};
 const residual=(source:'logical'|'binding'|'policy'|'native',path:string,reason:string,value:unknown)=>result.residuals.push({source,path,reason,value:copyJson(value)});
 residual('logical','/','Complete original logical content remains retained; generated SQL is a qualified approximation, never authored intent recovery from native-only input',logical);
 residual('binding','/','All binding content remains independently recoverable from the receipt',binding);
 if(nativeSource!==undefined)residual('native','/','Original permission-limited catalog text is preserved, not treated as an authenticated existing database to mutate',nativeSource);
 const checked=validateSqlServerRelationshipLayout(logical,binding,policy.layout,'report');result.residuals.push(...checked.residuals.map(r=>({...r,path:r.source==='policy'?'/layout'+r.path:r.path})));result.diagnostics.push(...checked.diagnostics);const payload=getBinding(binding,logical);
 if(payload.target.system!=='sqlserver'||payload.target.version!=='2022'||payload.target.subset!=='ordinary-tables-json-text-relationships-indexes')throw new UmfError('SQLSERVER_PHYSICAL_TARGET','Expected SQL Server 2022 full physical binding subset');
 const finish=()=>{result.diagnostics.push(...result.residuals.map(r=>({code:'SQLSERVER_PHYSICAL_RESIDUAL',path:'/'+r.source+r.path,message:r.reason,severity:result.status==='blocked'?'error' as const:'warning' as const})));if(!check(result))throw new UmfError('SQLSERVER_PHYSICAL_RESULT',JSON.stringify(check.errors));return copyJson(result) as unknown as SqlServerPhysicalProjection;};
 if(!checked.candidate)return finish();
 const recordPath=(ref:{module:string;element:string})=>{const mi=logical.modules.findIndex(m=>m.id===ref.module),ei=logical.modules[mi]!.elements.findIndex(e=>e.id===ref.element);return `/modules/${mi}/elements/${ei}`;};
 const p=checked.candidate;
 const physicalColumns=new Map<string,string>();
 for(const f of payload.fields){const owner=payload.elements.find(e=>id(e)===id(f));if(!owner?.table)continue;const column=(f.storage==='column'?f.column:f.documentColumn)!;const location=(owner.table+'.'+column).toLowerCase(),previous=physicalColumns.get(location);if(previous!==undefined&&previous!==column)throw new UmfError('SQLSERVER_PHYSICAL_COLUMN','Column names collide under the case-insensitive profile');physicalColumns.set(location,column);}
 for(const index of payload.indexes){if(index.predicate)literal(index.predicate.expression);if(index.predicate&&(/[\r\n\u2028\u2029]/.test(index.predicate.expression)||index.predicate.expression!==index.predicate.expression.trim()))throw new UmfError('SQLSERVER_PHYSICAL_PREDICATE','Predicate whitespace must be explicit canonical single-line text');}
 const staged=copyJson(binding) as unknown as Document;(staged.extensions!['umf.binding'] as any).target.subset='ordinary-tables-json-text-partition-scheme';
 const tablePolicy={fieldTypes:p.fieldLayouts.map(f=>({...f.boundField,sqlType:f.sqlType})),partitionFamilies:policy.partitionFamilies};
 const tables=projectBindingTablesToSqlServer(logical,staged,tablePolicy,'report');
 for(const r of tables.residuals){
  if(r.path.startsWith('/extensions/umf.binding/relationships/')||r.path.startsWith('/extensions/umf.binding/indexes/'))continue;
  const elementIndex=/^\/extensions\/umf.binding\/elements\/([0-9]+)$/.exec(r.path),owner=elementIndex?payload.elements[Number(elementIndex[1])]:undefined;
  if(owner&&r.reason.includes('does not emit a primary'))residual('logical',recordPath(owner)+'/extensions/umf.ddd/identity','DDD identity and scope remain distinct from emitted core Key constraints',r.choice);
  else if(owner&&r.reason.startsWith('DDD aggregate'))residual('logical',recordPath(owner)+'/extensions/umf.ddd/aggregate',r.reason,r.choice);
  else if(owner&&r.reason==='DDD field has no physical binding'){const field=(r.choice as {field:string}).field;const record=logical.modules.find(m=>m.id===owner.module)!.elements.find(e=>e.id===owner.element)!;residual('logical',recordPath(owner)+'/extensions/umf.ddd/fields/'+field.replaceAll('~','~0').replaceAll('/','~1'),r.reason,(record.extensions['umf.ddd'] as any).fields[field]);}
  else residual(r.path.startsWith('/modules')?'logical':'binding',r.path,r.reason,r.choice);
 }
 if(!tables.candidate)return finish();
 // No unsupported bound attribute may disappear while relationship SQL still succeeds.
 for(const [i,f] of payload.fields.entries())if(f.storage==='column'&&!tables.mappings.some(m=>m.sourcePath===`/extensions/umf.binding/fields/${i}`))throw new UmfError('SQLSERVER_PHYSICAL_COLUMN','A declared direct column was not emitted by the table plan');
 result.mappings.push(...tables.mappings.map(m=>({...m,sourcePath:'/binding'+m.sourcePath,kind:m.sourcePath.includes('/fields/')?'column' as const:'table' as const,outcome:'approximated' as const})));
 const statements=[tables.candidate],reserved=new Set<string>(),indexes=new Set<string>();const reserve=(table:string,name:string,isIndex=false)=>{quote(name);const namespace=isIndex?table:table.split('.')[0]!,k=(namespace+'.'+name).toLowerCase(),set=isIndex?indexes:reserved;if(set.has(k))throw new UmfError('SQLSERVER_PHYSICAL_COLLISION','Generated name collides: '+k);set.add(k);};
 for(const e of payload.elements)reserve(e.table!,e.table!.split('.')[1]!);
 for(const index of payload.indexes){const target=index.on[0],ref=target&&('field'in target?target.field:target.documentPath.field),e=payload.elements.find(e=>ref&&id(e)===id(ref));if(e?.table)reserve(e.table,index.name,true);}
 // Account for implicit JSON CHECK names emitted by the existing table stage.
 const jsonChecks=new Set<string>();for(const f of payload.fields.filter(f=>f.storage==='embedded')){const e=payload.elements.find(e=>id(e)===id(f))!;const name='CK_'+e.table!.split('.')[1]+'_'+f.documentColumn+'_json',k=e.table+'.'+name;if(!jsonChecks.has(k)){reserve(e.table!,name);jsonChecks.add(k);}}
 for(const f of p.fieldLayouts)if(f.collation)statements.push(`ALTER TABLE ${qualified(f.table)} ALTER COLUMN ${quote(f.column)} ${type(f)};`);
 const keyMap=new Map<string,SqlServerLayoutKey>();
 for(const [i,k] of p.keyLayouts.entries()){
  const record=logical.modules.find(m=>m.id===k.record.module)!.elements.find(e=>e.id===k.record.element)!,key=(record.keys as any[]).find(x=>x.id===k.key);keyMap.set(kid({...k.record,key:k.key}),k);reserve(k.table,k.constraint);reserve(k.table,k.constraint,true);
  const bytes=k.components.reduce((n,c)=>n+maximumBytes(c.sqlType),0);
  if(k.components.length>16||bytes>900)throw new UmfError('SQLSERVER_PHYSICAL_KEY_WIDTH','This conservative Key profile limits tuples to 16 columns and 900 declared bytes');
  statements.push(`ALTER TABLE ${qualified(k.table)} ADD CONSTRAINT ${quote(k.constraint)} ${key.primary?'PRIMARY KEY':'UNIQUE'} NONCLUSTERED (${tuple(k.components.map(c=>c.column))});`);
  result.mappings.push({sourcePath:`/policy/layout/keyLayouts/${i}`,target:k.table+'.'+k.constraint,kind:'key',outcome:'approximated'});residual('logical',recordPath(k.record)+'/keys/'+(record.keys as any[]).findIndex(x=>x.id===k.key),'Stored native uniqueness retains primary/alternate tuple layout, not authored identity or exact coercion/comparison semantics',key);
 }
 const anonymous=new Map<string,typeof p.relationshipLayouts>();
 for(const l of p.relationshipLayouts)if(l.storage!=='foreign_key'&&!l.associationRecord){const list=anonymous.get(l.carrierTable)??[];list.push(l);anonymous.set(l.carrierTable,list);}
 for(const [table,layouts] of anonymous){const l=layouts[0]!,components=[...l.sourceComponents!,...l.targetComponents];if(components.length>16||components.reduce((n,c)=>n+maximumBytes(c.sqlType),l.discriminator?256:0)>900)throw new UmfError('SQLSERVER_PHYSICAL_KEY_WIDTH','Anonymous pair tuple exceeds the qualified Key size');if(components.some(c=>c.nullable))throw new UmfError('SQLSERVER_PHYSICAL_NULL','Anonymous pair identity requires non-null endpoint components');reserve(table,table.split('.')[1]!);
  const schemaName=table.split('.')[0]!;statements.push(`IF SCHEMA_ID(${literal(schemaName)}) IS NULL EXEC(${literal('CREATE SCHEMA '+quote(schemaName))});`);
  const defs=components.map(c=>quote(c.carrierColumn)+' '+type(c));const pair=[...(l.discriminator?[l.discriminator.column]:[]),...components.map(c=>c.carrierColumn)],name='PK_'+table.split('.')[1]+'_pair';reserve(table,name);reserve(table,name,true);
  if(l.discriminator){defs.push(quote(l.discriminator.column)+' '+type(l.discriminator));defs.push(`CHECK (${quote(l.discriminator.column)} IN (${layouts.map(x=>literal(x.discriminator!.value)).join(', ')}))`);}
  defs.push(`CONSTRAINT ${quote(name)} PRIMARY KEY NONCLUSTERED (${tuple(pair)})`);statements.push(`CREATE TABLE ${qualified(table)} (\n  ${defs.join(',\n  ')}\n);`);
 }
 for(const [i,l] of p.relationshipLayouts.entries()){
  const rel=(logical.modules.find(m=>m.id===l.relationship.module)!.relationships as any[]).find((r:any)=>r.id===l.relationship.id)!;
  if(l.associationRecord&&l.discriminator)throw new UmfError('SQLSERVER_PHYSICAL_ASSOCIATION','Edge discriminator for a bound association Record needs an explicit bound Field policy');
  const fk=(keyRef:{module:string;element:string;key:string},components:SqlServerLayoutEndpointComponent[],name:string)=>{const key=keyMap.get(kid(keyRef))!;reserve(l.carrierTable,name);statements.push(`ALTER TABLE ${qualified(l.carrierTable)} WITH CHECK ADD CONSTRAINT ${quote(name)} FOREIGN KEY (${tuple(components.map(c=>c.carrierColumn))}) REFERENCES ${qualified(key.table)} (${tuple(key.components.map(c=>c.column))}) ON DELETE NO ACTION ON UPDATE NO ACTION;`);};
  fk(l.targetKey,l.targetComponents,l.targetConstraint);if(l.storage!=='foreign_key')fk(l.sourceKey!,l.sourceComponents!,l.sourceConstraint!);
  const unique=(components:SqlServerLayoutEndpointComponent[],suffix:string)=>{const name=l.targetConstraint+suffix;reserve(l.carrierTable,name,true);const names=components.map(c=>c.carrierColumn),filter=components.filter(c=>c.nullable).map(c=>quote(c.carrierColumn)+' IS NOT NULL');if(l.discriminator)filter.push(quote(l.discriminator.column)+' = '+literal(l.discriminator.value));statements.push(`CREATE UNIQUE NONCLUSTERED INDEX ${quote(name)} ON ${qualified(l.carrierTable)} (${tuple(names)})${filter.length?' WHERE '+filter.join(' AND '):''};`);};
  if(rel.sourceMultiplicity.max===1)unique(l.targetComponents,'_reverse');if(l.storage!=='foreign_key'&&rel.targetMultiplicity.max===1)unique(l.sourceComponents!,'_forward');
  result.mappings.push({sourcePath:`/policy/layout/relationshipLayouts/${i}`,target:l.carrierTable+'.'+l.targetConstraint,kind:'relationship',outcome:'approximated'});
  residual('logical',`/modules/${logical.modules.findIndex(m=>m.id===l.relationship.module)}/relationships/${(logical.modules.find(m=>m.id===l.relationship.module)!.relationships as any[]).findIndex(r=>r.id===l.relationship.id)}`,'NO ACTION is a physical choice, not ownership. Native nullable tuples, existing-data snapshots, participation minima and bounds greater than one remain qualified residuals. Keyed association identity and attributes survive without imposing endpoint-pair uniqueness.',rel);
 }
 const planned:SqlServerPlannedColumn[]=p.fieldLayouts.map(f=>({schema:f.table.split('.')[0]!,table:f.table.split('.')[1]!,column:f.column,maxLength:f.sqlType.includes('(max)')?-1:/^nvarchar\(([0-9]+)\)$/.test(f.sqlType)?Number(f.sqlType.slice(9,-1))*2:/^varbinary\(([0-9]+)\)$/.test(f.sqlType)?Number(f.sqlType.slice(10,-1)):16}));
 for(const index of payload.indexes.filter(x=>['btree','unique','partial'].includes(x.kind)&&x.on.every(t=>'field'in t))){const fields=index.on.map(t=>'field'in t?p.fieldLayouts.find(f=>same(f.boundField,t.field)):undefined);if(index.on.length>16||fields.every(Boolean)&&fields.reduce((n,f)=>n+maximumBytes(f!.sqlType),0)>900&&!fields.some(f=>f?.sqlType.includes('(max)')))throw new UmfError('SQLSERVER_PHYSICAL_INDEX_WIDTH','Declared index exceeds this profile: 16 columns / 900 key bytes');}
 const indexReport=projectBindingIndexesAgainstSqlServerPlan(logical,binding,planned,'report');
 for(const r of indexReport.residuals)residual('binding',r.path,r.reason,r.choice);
 if(indexReport.candidate)statements.push(indexReport.candidate);
 for(const [i,index] of payload.indexes.entries())if(!indexReport.residuals.some(r=>r.path===`/extensions/umf.binding/indexes/${i}`))result.mappings.push({sourcePath:`/binding/extensions/umf.binding/indexes/${i}`,target:index.name,kind:'index',outcome:'approximated'});
 if(lossPolicy==='report'){result.status='reported';result.candidate=statements.join('\n')+'\n';}return finish();
}
export function verifyBindingSqlServerProjection(input:SqlServerPhysicalProjection,current:string){const r=copyJson(input) as unknown as SqlServerPhysicalProjection;if(!check(r)||r.status!=='reported'||!same(r,projectBindingToSqlServer(r.logical,r.binding,r.policy,r.lossPolicy,r.nativeSource)))throw new UmfError('SQLSERVER_PHYSICAL_RECEIPT','Inconsistent retained physical projection');if(current!==r.candidate)throw new UmfError('SQLSERVER_PHYSICAL_STALE','Generated SQL changed');return r;}
export function recoverBindingSqlServerSources(input:SqlServerPhysicalProjection,current:string){const r=verifyBindingSqlServerProjection(input,current);return {logical:copyJson(r.logical) as unknown as Document,binding:copyJson(r.binding) as unknown as Document,policy:copyJson(r.policy) as unknown as SqlServerPhysicalPolicy};}
export function recoverBindingSqlServerNative(input:SqlServerPhysicalProjection,current:string){const r=verifyBindingSqlServerProjection(input,current);return {sql:r.candidate!,...(r.nativeSource===undefined?{}:{catalog:r.nativeSource})};}
