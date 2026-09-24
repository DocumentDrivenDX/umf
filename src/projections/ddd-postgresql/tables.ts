import {copyJson} from '../../model/json';
import {UmfError,type Document} from '../../model/types';
import {getBinding,inspectBinding,type BindingFieldRef,type BindingPayload} from '../../extensions/binding';
import {inspectDdd,type DddEntity} from '../../extensions/ddd';
import {exportPostgresqlSql,importPostgresqlSql,type PostgresqlBackend} from '../../adapters/postgresql';

export interface DddPostgresqlFieldType extends BindingFieldRef {sqlType:string}
export interface DddPostgresqlListPartition {name:string;column:string;defaultTable:string}
export interface DddPostgresqlTablePolicy {fieldTypes:DddPostgresqlFieldType[];partitionFamilies:DddPostgresqlListPartition[]}
export interface DddPostgresqlTableResidual {path:string;reason:string;choice:unknown}
export interface DddPostgresqlTableMapping {sourcePath:string;target:string}
export interface DddPostgresqlTableProjection {
  status:'blocked'|'reported'|'proposed';logical:Document;binding:Document;policy:DddPostgresqlTablePolicy;
  target:BindingPayload['target'];residuals:DddPostgresqlTableResidual[];mappings:DddPostgresqlTableMapping[];
  candidate?:string;targetArchive?:Document;
}

const key=(r:BindingFieldRef)=>JSON.stringify([r.module,r.element,r.field??null]);
const quote=(name:string)=>{
  if(!name||new TextEncoder().encode(name).length>63||/[\0\uD800-\uDFFF]/u.test(name))throw new UmfError('POSTGRESQL_IDENTIFIER','Invalid or truncated PostgreSQL identifier');
  return '"'+name.replace(/"/g,'""')+'"';
};
function scalarType(sqlType:string):{sql:string;ddd:string}|undefined{
  const type=sqlType.toLowerCase().replace(/\s+/g,'');
  if(type==='boolean')return {sql:type,ddd:'boolean'};
  if(['smallint','integer','bigint'].includes(type))return {sql:type,ddd:'integer'};
  if(type==='text')return {sql:type,ddd:'string'};
  const varchar=/^varchar\(([1-9][0-9]{0,6})\)$/.exec(type);
  if(varchar&&Number(varchar[1])<=10485760)return {sql:type,ddd:'string'};
  if(type==='bytea')return {sql:type,ddd:'bytes'};
  const decimal=/^numeric\(([1-9][0-9]{0,2}),(0|[1-9][0-9]{0,2})\)$/.exec(type);
  if(decimal&&Number(decimal[2])<=Number(decimal[1]))return {sql:type,ddd:'decimal'};
  const temporal=/^timestamp(?:tz)?\(([0-6])\)$/.exec(type);
  if(temporal)return {sql:type,ddd:'date-time'};
  return undefined;
}

/** Relationship-independent PostgreSQL 17 DDD table proposal checked by the native adapter. */
export async function projectDddTablesToPostgresql(logical:Document,binding:Document,backend:PostgresqlBackend,policy:DddPostgresqlTablePolicy,lossPolicy:'strict'|'report'):Promise<DddPostgresqlTableProjection>{
  const checked=inspectBinding(binding,logical);
  if(checked.diagnostics.some(d=>d.code==='BINDING_UNKNOWN'))throw new UmfError('BINDING_INCOMPLETE','Unknown physical choice may affect PostgreSQL DDL');
  const payload=getBinding(binding,logical);
  if(payload.target.system!=='postgresql'||!/^17(?:\.|$)/.test(payload.target.version)||payload.target.subset!=='ddd-tables-jsonb-list-partition')throw new UmfError('BINDING_TARGET','Expected pinned PostgreSQL 17 DDD table subset');
  const ddd=inspectDdd(logical);
  if(!ddd.valid||ddd.diagnostics.some(d=>d.code==='DDD_UNKNOWN'))throw new UmfError('DDD_DOCUMENT','Invalid or uninterpreted DDD model');
  if(!policy||!Array.isArray(policy.fieldTypes)||!Array.isArray(policy.partitionFamilies)||Object.keys(policy).some(k=>!['fieldTypes','partitionFamilies'].includes(k)))throw new UmfError('POSTGRESQL_TABLE_POLICY','Explicit type and partition policy required');
  const typeMap=new Map<string,string>(),families=new Map<string,DddPostgresqlListPartition>();
  for(const row of policy.fieldTypes){
    if(!row||typeof row.module!=='string'||typeof row.element!=='string'||typeof row.field!=='string'||typeof row.sqlType!=='string'||Object.keys(row).some(k=>!['module','element','field','sqlType'].includes(k))||typeMap.has(key(row)))throw new UmfError('POSTGRESQL_TABLE_POLICY','Invalid or duplicate field type policy');
    typeMap.set(key(row),row.sqlType);
  }
  for(const row of policy.partitionFamilies){
    if(!row||typeof row.name!=='string'||typeof row.column!=='string'||typeof row.defaultTable!=='string'||Object.keys(row).some(k=>!['name','column','defaultTable'].includes(k))||families.has(row.name))throw new UmfError('POSTGRESQL_TABLE_POLICY','Invalid or duplicate partition family');
    quote(row.column);quote(row.defaultTable);families.set(row.name,row);
  }
  const residuals:DddPostgresqlTableResidual[]=[],mappings:DddPostgresqlTableMapping[]=[],statements:string[]=[],schemas=new Set<string>(),tables=new Set<string>();
  const add=(path:string,reason:string,choice:unknown)=>residuals.push({path,reason,choice:copyJson(choice)});
  for(const [ei,element] of payload.elements.entries()){
    const ep=`/extensions/umf.binding/elements/${ei}`;
    const module=logical.modules.find(m=>m.id===element.module);
    const owner=module?.elements.find(e=>e.id===element.element);
    const definition=owner?.extensions?.['umf.ddd'] as DddEntity|undefined;
    if(definition?.kind!=='entity'){add(ep,'Only DDD entities have a table carrier in this slice',element);continue;}
    const table=element.table?.split('.');
    if(!table||table.length!==2||table.some(x=>!x)){add(ep,'An exact schema.table override is required',element);continue;}
    const [schema,name]=table as [string,string];quote(schema);quote(name);
    const tableId=JSON.stringify([schema,name]);
    if(tables.has(tableId))throw new UmfError('POSTGRESQL_TABLE_DUPLICATE','Two logical elements target one PostgreSQL table');
    tables.add(tableId);
    const columns:string[]=[],occupied=new Set<string>();
    const addColumn=(column:string,sql:string,path:string)=>{
      if(occupied.has(column))throw new UmfError('POSTGRESQL_TABLE_COLUMN','Duplicate physical column '+column);
      quote(column);occupied.add(column);columns.push(quote(column)+' '+sql);mappings.push({sourcePath:path,target:schema+'.'+name+'.'+column});
    };
    const rows=payload.fields.map((field,index)=>({field,index})).filter(({field})=>field.module===element.module&&field.element===element.element);
    const bound=new Set(rows.map(({field})=>field.field));
    for(const fieldName of Object.keys(definition.fields))if(!bound.has(fieldName))add(ep,'DDD field has no physical binding',{field:fieldName});
    const embedded=new Map<string,{paths:string[][];sourcePaths:string[]}>();
    for(const {field,index} of rows){
      const fp=`/extensions/umf.binding/fields/${index}`;
      if(field.field===undefined){add(fp,'This slice requires an exact DDD field key',field);continue;}
      const authored=definition.fields[field.field];
      if(!authored)throw new UmfError('BINDING_REFERENCE','Unresolved DDD field');
      if(field.storage==='embedded'){
        const column=field.documentColumn!;quote(column);
        const group=embedded.get(column)??{paths:[],sourcePaths:[]};group.paths.push(field.path!);group.sourcePaths.push(fp);embedded.set(column,group);
        add(fp,'JSONB normalizes document representation and does not enforce embedded path presence or value type',field);
        continue;
      }
      if(authored.cardinality==='many'){add(fp,'A many-valued DDD field needs a separately declared table or JSONB carrier',field);continue;}
      if(authored.type.kind!=='scalar'){add(fp,'Concept-valued field needs an explicit relationship or serialization profile',field);continue;}
      const requested=typeMap.get(key(field)),mapped=requested&&scalarType(requested);
      if(!mapped||mapped.ddd!==authored.type.name){add(fp,'No safe explicit PostgreSQL scalar type mapping for this DDD field',{field,type:requested});continue;}
      if(authored.type.name==='integer')add(fp,'PostgreSQL finite integer domain narrows unbounded DDD integer',field);
      if(authored.type.name==='string')add(fp,'PostgreSQL text/varchar storage and collation do not establish unrestricted DDD string semantics',field);
      if(authored.type.name==='decimal')add(fp,'PostgreSQL numeric precision and scale narrow unqualified DDD decimal',field);
      if(authored.type.name==='bytes')add(fp,'PostgreSQL bytea storage has a finite size bound outside DDD bytes meaning',field);
      if(authored.type.name==='date-time')add(fp,'DDD date-time does not declare instant/civil, precision or offset semantics',field);
      if(authored.cardinality==='optional')add(fp,'SQL NULL is the selected absence carrier, not an implication of DDD optionality',field);
      addColumn(field.column!,mapped.sql+(authored.cardinality==='one'?' NOT NULL':''),fp);
    }
    for(const [column,group] of embedded){
      if(occupied.has(column))throw new UmfError('POSTGRESQL_TABLE_COLUMN','Embedded document column cannot alias a scalar column in this profile');
      addColumn(column,'jsonb',group.sourcePaths[0]!);
      columns.push(`CONSTRAINT ${quote('ck_'+name+'_'+column+'_object')} CHECK (${quote(column)} IS NULL OR jsonb_typeof(${quote(column)}) = 'object')`);
      const paths=new Set<string>();for(const path of group.paths){const encoded=JSON.stringify(path);if(paths.has(encoded))throw new UmfError('POSTGRESQL_TABLE_PATH','Duplicate embedded path in one document column');paths.add(encoded);}
    }
    if(!columns.length){add(ep,'Cannot emit an empty PostgreSQL table',element);continue;}
    if(!schemas.has(schema)){schemas.add(schema);statements.push(`CREATE SCHEMA IF NOT EXISTS ${quote(schema)};`);}
    let placement='',child='';
    if(element.partition!==undefined&&element.partition!==null){
      const family=families.get(element.partition);
      if(!family)add(ep+'/partition','Partition family lacks an explicit LIST/default policy',element.partition);
      else if(!occupied.has(family.column))add(ep+'/partition','Partition column is absent from emitted table',family);
      else{
        placement=` PARTITION BY LIST (${quote(family.column)})`;
        const childId=JSON.stringify([schema,family.defaultTable]);
        if(tables.has(childId))throw new UmfError('POSTGRESQL_TABLE_DUPLICATE','Default partition table collides with another target');
        tables.add(childId);
        child=`CREATE TABLE ${quote(schema)}.${quote(family.defaultTable)} PARTITION OF ${quote(schema)}.${quote(name)} DEFAULT;`;
      }
    }
    statements.push(`CREATE TABLE ${quote(schema)}.${quote(name)} (\n  ${columns.join(',\n  ')}\n)${placement};`);
    if(child)statements.push(child);
    mappings.push({sourcePath:ep,target:schema+'.'+name});
    add(ep,'DDD identity is retained; this table slice does not emit a primary or unique key',definition.identity);
    if(definition.aggregate)add(ep,'DDD aggregate membership and lifecycle are not SQL table semantics',definition.aggregate);
    for(const [ii,invariant] of (definition.invariants??[]).entries())add(`/modules/${logical.modules.indexOf(module!)}/elements/${module!.elements.indexOf(owner!)}/extensions/umf.ddd/invariants/${ii}`,'DDD invariant is retained but not interpreted or enforced',invariant);
  }
  for(const [i,field] of payload.fields.entries())if(!payload.elements.some(element=>element.module===field.module&&element.element===field.element))add(`/extensions/umf.binding/fields/${i}`,'Field has no table-bound owner in this projection',field);
  for(const [i,item] of payload.relationships.entries())add(`/extensions/umf.binding/relationships/${i}`,'Relationship storage is handled by the relationship-dependent generator',item);
  for(const [i,item] of payload.indexes.entries())add(`/extensions/umf.binding/indexes/${i}`,'Index storage is handled by the separate index generator',item);
  if(!statements.length)add('/extensions/umf.binding/elements','No complete PostgreSQL table can be emitted',payload.elements);
  const candidate=statements.join('\n')+'\n';
  let targetArchive:Document|undefined,syntaxValid=!!statements.length;
  if(syntaxValid)try{targetArchive=await importPostgresqlSql(candidate,backend,{id:'ddd-postgresql-tables-target'});await exportPostgresqlSql(targetArchive,backend);}catch{syntaxValid=false;add('/extensions/umf.binding','Generated DDL did not pass PostgreSQL parser/deparser/codec',payload.target);}
  const status:DddPostgresqlTableProjection['status']=!syntaxValid?'blocked':residuals.length?(lossPolicy==='strict'?'blocked':'reported'):'proposed';
  return {status,logical:copyJson(logical) as unknown as Document,binding:copyJson(binding) as unknown as Document,policy:copyJson(policy) as unknown as DddPostgresqlTablePolicy,target:copyJson(payload.target) as BindingPayload['target'],residuals,mappings,...(status!=='blocked'&&targetArchive?{candidate,targetArchive}:{})};
}
