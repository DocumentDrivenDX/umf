import {copyJson} from '../../model/json';
import {UmfError,type Document} from '../../model/types';
import {getBinding,inspectBinding,type BindingFieldRef,type BindingPayload} from '../../extensions/binding';
import {inspectDdd,type DddEntity} from '../../extensions/ddd';
import {importSqlServerCatalog} from '../../adapters/sqlserver';

export interface SqlServerFieldType extends BindingFieldRef {sqlType:string}
export interface SqlServerPartitionFamily {name:string;scheme:string;column:string}
export interface SqlServerTablePolicy {fieldTypes:SqlServerFieldType[];partitionFamilies:SqlServerPartitionFamily[]}
export interface SqlServerTableResidual {path:string;reason:string;choice:unknown}
export interface SqlServerTableMapping {sourcePath:string;target:string}
export interface SqlServerTableProjection {
  status:'blocked'|'reported'|'proposed';logical:Document;binding:Document;target:BindingPayload['target'];
  policy:SqlServerTablePolicy;residuals:SqlServerTableResidual[];mappings:SqlServerTableMapping[];candidate?:string;
  nativeArchive?:Document;nativeSource?:string;
}

const key=(r:BindingFieldRef)=>JSON.stringify([r.module,r.element,r.field??null]);
const quote=(name:string)=>{
  if(!name||new TextEncoder().encode(name).length>128||/[\0\uD800-\uDFFF]/u.test(name))throw new UmfError('SQLSERVER_IDENTIFIER','Invalid or truncated SQL Server identifier');
  return '['+name.replace(/]/g,']]')+']';
};
const literal=(text:string)=>"N'"+text.replace(/'/g,"''")+"'";
function scalarType(sqlType:string):{sql:string;ddd:string}|undefined{
  const type=sqlType.toLowerCase().replace(/\s+/g,'');
  if(['bit','tinyint','smallint','int','bigint'].includes(type))return {sql:type,ddd:type==='bit'?'boolean':'integer'};
  if(type==='date')return {sql:type,ddd:'date-time'};
  const text=/^nvarchar\((max|[1-9][0-9]{0,3})\)$/.exec(type);
  if(text&&(text[1]==='max'||Number(text[1])<=4000))return {sql:type,ddd:'string'};
  const bytes=/^varbinary\((max|[1-9][0-9]{0,3})\)$/.exec(type);
  if(bytes&&(bytes[1]==='max'||Number(bytes[1])<=8000))return {sql:type,ddd:'bytes'};
  const decimal=/^decimal\(([1-9]|[12][0-9]|3[0-8]),(0|[1-9]|[12][0-9]|3[0-8])\)$/.exec(type);
  if(decimal&&Number(decimal[2])<=Number(decimal[1]))return {sql:type,ddd:'decimal'};
  const temporal=/^datetime(?:2|offset)\(([0-7])\)$/.exec(type);
  if(temporal)return {sql:type,ddd:'date-time'};
  return undefined;
}

/** Relationship-independent SQL Server 2022 table proposal from an authored physical binding. */
export function projectBindingTablesToSqlServer(logical:Document,binding:Document,policy:SqlServerTablePolicy,lossPolicy:'strict'|'report',nativeSource?:string):SqlServerTableProjection{
  const checked=inspectBinding(binding,logical);
  if(checked.diagnostics.some(d=>d.code==='BINDING_UNKNOWN'))throw new UmfError('BINDING_INCOMPLETE','Unknown physical choice may affect SQL Server DDL');
  const payload=getBinding(binding,logical);
  if(payload.target.system!=='sqlserver'||payload.target.version!=='2022'||payload.target.subset!=='ordinary-tables-json-text-partition-scheme')throw new UmfError('BINDING_TARGET','Expected pinned SQL Server 2022 table subset');
  const ddd=inspectDdd(logical);
  if(!ddd.valid||ddd.diagnostics.some(d=>d.code==='DDD_UNKNOWN'))throw new UmfError('DDD_DOCUMENT','Invalid or uninterpreted DDD model');
  if(!policy||!Array.isArray(policy.fieldTypes)||!Array.isArray(policy.partitionFamilies)||Object.keys(policy).some(k=>!['fieldTypes','partitionFamilies'].includes(k)))throw new UmfError('SQLSERVER_TABLE_POLICY','Explicit type and partition-family policy required');
  const typeMap=new Map<string,string>(),families=new Map<string,SqlServerPartitionFamily>();
  for(const row of policy.fieldTypes){
    if(!row||typeof row.module!=='string'||typeof row.element!=='string'||typeof row.field!=='string'||typeof row.sqlType!=='string'||Object.keys(row).some(k=>!['module','element','field','sqlType'].includes(k))||typeMap.has(key(row)))throw new UmfError('SQLSERVER_TABLE_POLICY','Invalid or duplicate field type policy');
    typeMap.set(key(row),row.sqlType);
  }
  for(const row of policy.partitionFamilies){
    if(!row||typeof row.name!=='string'||typeof row.scheme!=='string'||typeof row.column!=='string'||Object.keys(row).some(k=>!['name','scheme','column'].includes(k))||families.has(row.name))throw new UmfError('SQLSERVER_TABLE_POLICY','Invalid or duplicate partition family');
    quote(row.scheme);quote(row.column);families.set(row.name,row);
  }
  const residuals:SqlServerTableResidual[]=[],mappings:SqlServerTableMapping[]=[],statements:string[]=[],schemas=new Set<string>(),tables=new Set<string>();
  const add=(path:string,reason:string,choice:unknown)=>residuals.push({path,reason,choice:copyJson(choice)});
  for(const [ei,element] of payload.elements.entries()){
    const ep=`/extensions/umf.binding/elements/${ei}`;
    const owner=logical.modules.find(m=>m.id===element.module)?.elements.find(e=>e.id===element.element);
    const definition=owner?.extensions?.['umf.ddd'] as DddEntity|undefined;
    if(definition?.kind!=='entity'){add(ep,'Only DDD entities have a table carrier in this slice',element);continue;}
    const table=element.table?.split('.');
    if(!table||table.length!==2||table.some(x=>!x)){add(ep,'An exact schema.table override is required',element);continue;}
    const [schema,name]=table as [string,string];quote(schema);quote(name);
    const tableId=JSON.stringify([schema.toLowerCase(),name.toLowerCase()]);
    if(tables.has(tableId))throw new UmfError('SQLSERVER_TABLE_DUPLICATE','Two logical elements target one SQL Server table');
    tables.add(tableId);
    const columns:string[]=[],occupied=new Set<string>();
    const addColumn=(column:string,sql:string,path:string)=>{
      if(occupied.has(column))throw new UmfError('SQLSERVER_TABLE_COLUMN','Duplicate physical column '+column);
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
        add(fp,'SQL Server stores the declared path in text JSON; path presence and value type are not enforced by this table DDL',field);
        continue;
      }
      if(authored.cardinality==='many'){add(fp,'A many-valued DDD field needs a separately declared table or document carrier',field);continue;}
      if(authored.type.kind!=='scalar'){add(fp,'Concept-valued field needs an explicit relationship or serialization profile',field);continue;}
      const requested=typeMap.get(key(field));
      const mapped=requested&&scalarType(requested);
      if(!mapped||mapped.ddd!==authored.type.name){add(fp,'No safe explicit SQL scalar type mapping for this DDD field',{field,type:requested});continue;}
      if(authored.type.name==='integer')add(fp,'SQL Server finite integer domain does not represent an unbounded DDD integer',field);
      if(authored.type.name==='string')add(fp,'SQL Server nvarchar has finite UTF-16 storage, collation and trailing-space behavior outside DDD string meaning',field);
      if(authored.type.name==='decimal')add(fp,'SQL Server decimal precision and scale narrow an unqualified DDD decimal',field);
      if(authored.type.name==='bytes')add(fp,'SQL Server varbinary has a finite length bound outside DDD bytes meaning',field);
      if(authored.type.name==='date-time')add(fp,'DDD date-time does not declare instant/civil, precision or offset semantics',field);
      if(authored.cardinality==='optional')add(fp,'SQL NULL is the selected absence carrier; DDD optionality alone does not define native NULL behavior',field);
      addColumn(field.column!,mapped.sql+(authored.cardinality==='one'?' NOT NULL':' NULL'),fp);
    }
    for(const [column,group] of embedded){
      if(occupied.has(column)){
        const direct=rows.find(({field})=>field.storage==='column'&&field.column===column)?.field;
        if(!direct||scalarType(typeMap.get(key(direct))??'')?.sql!=='nvarchar(max)')throw new UmfError('SQLSERVER_TABLE_COLUMN','Embedded document column must be an explicitly typed nvarchar(max) carrier');
      }else addColumn(column,'nvarchar(max) NULL',group.sourcePaths[0]!);
      columns.push(`CONSTRAINT ${quote('CK_'+name+'_'+column+'_json')} CHECK (${quote(column)} IS NULL OR ISJSON(${quote(column)}, OBJECT)=1)`);
      const paths=new Set<string>();
      for(const path of group.paths){const encoded=JSON.stringify(path);if(paths.has(encoded))throw new UmfError('SQLSERVER_TABLE_PATH','Duplicate embedded path in a document column');paths.add(encoded);}
    }
    if(!columns.length){add(ep,'Cannot emit an empty SQL Server table',element);continue;}
    if(!schemas.has(schema)){schemas.add(schema);statements.push(`IF SCHEMA_ID(${literal(schema)}) IS NULL EXEC(${literal('CREATE SCHEMA '+quote(schema))});`);}
    let placement='';
    if(element.partition!==undefined&&element.partition!==null){
      const family=families.get(element.partition);
      if(!family){add(ep+'/partition','Partition family lacks an explicit SQL Server scheme/column policy',element.partition);}
      else if(!occupied.has(family.column)){add(ep+'/partition','Partition column is absent from emitted table',family);}
      else placement=` ON ${quote(family.scheme)}(${quote(family.column)})`;
    }
    statements.push(`CREATE TABLE ${quote(schema)}.${quote(name)} (\n  ${columns.join(',\n  ')}\n)${placement};`);
    mappings.push({sourcePath:ep,target:schema+'.'+name});
    add(ep,'DDD identity is retained; this table slice does not emit a primary or unique key',definition.identity);
    if(definition.aggregate)add(ep,'DDD aggregate membership and lifecycle are not SQL table semantics',definition.aggregate);
    for(const [ii,invariant] of (definition.invariants??[]).entries())add(`/modules/${logical.modules.findIndex(m=>m.id===element.module)}/elements/${logical.modules.find(m=>m.id===element.module)?.elements.findIndex(e=>e.id===element.element)}/extensions/umf.ddd/invariants/${ii}`,'DDD invariant is retained but not interpreted or enforced',invariant);
  }
  for(const [i,field] of payload.fields.entries())if(!payload.elements.some(element=>element.module===field.module&&element.element===field.element))add(`/extensions/umf.binding/fields/${i}`,'Field has no table-bound owner in this projection',field);
  for(const [i,item] of payload.relationships.entries())add(`/extensions/umf.binding/relationships/${i}`,'Relationship storage is handled by the relationship-dependent generator',item);
  for(const [i,item] of payload.indexes.entries())add(`/extensions/umf.binding/indexes/${i}`,'Index storage is handled by the separate index generator',item);
  if(!statements.length)add('/extensions/umf.binding/elements','No complete SQL Server table can be emitted',payload.elements);
  const status:SqlServerTableProjection['status']=!statements.length?'blocked':residuals.length?(lossPolicy==='strict'?'blocked':'reported'):'proposed';
  const nativeArchive=nativeSource===undefined?undefined:importSqlServerCatalog(nativeSource,{id:'sqlserver-binding-native-archive'});
  return {status,logical:copyJson(logical) as unknown as Document,binding:copyJson(binding) as unknown as Document,target:copyJson(payload.target) as BindingPayload['target'],policy:copyJson(policy) as unknown as SqlServerTablePolicy,residuals,mappings,...(nativeSource===undefined?{}:{nativeArchive:nativeArchive!,nativeSource}),...(status!=='blocked'&&statements.length?{candidate:statements.join('\n')+'\n'}:{})};
}
