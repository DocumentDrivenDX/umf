import {copyJson} from '../../model/json';
import {renderTree} from '../../model/native-json';
import {UmfError,type Document} from '../../model/types';
import {getBinding,inspectBinding,type BindingFieldRef,type BindingPayload} from '../../extensions/binding';
import {getPostgresqlDdlDeclarations} from '../../adapters/postgresql/declarations';
import {exportPostgresqlSql,importPostgresqlSql,type PostgresqlBackend} from '../../adapters/postgresql';

export interface PostgresqlBindingResidual {path:string;reason:string;choice:unknown}
export interface PostgresqlIndexProjection {
  status:'blocked'|'reported'|'proposed';logical:Document;binding:Document;nativeArchive:Document;
  target:BindingPayload['target'];residuals:PostgresqlBindingResidual[];
  /** DDL proposal verified by the pinned parser/deparser/codec; execution is a separate oracle. */
  candidate?:string;
}

const quote=(s:string)=>{
  if(!s||new TextEncoder().encode(s).length>63||/[\0\uD800-\uDFFF]/u.test(s))throw new UmfError('POSTGRESQL_IDENTIFIER','Identifier is empty, exceeds 63 bytes or contains an invalid scalar');
  return '"'+s.replace(/"/g,'""')+'"';
};
const literal=(s:string)=>"'"+s.replace(/'/g,"''")+"'";
const same=(a:BindingFieldRef,b:BindingFieldRef)=>a.module===b.module&&a.element===b.element&&a.field===b.field;

/** Emit PostgreSQL 17 index DDL only against exact columns in a retained CREATE TABLE source. */
export async function projectBindingIndexesToPostgresql(logical:Document,binding:Document,nativeArchive:Document,backend:PostgresqlBackend,lossPolicy:'strict'|'report'):Promise<PostgresqlIndexProjection>{
  if(inspectBinding(binding,logical).diagnostics.some(d=>d.code==='BINDING_UNKNOWN'))throw new UmfError('BINDING_INCOMPLETE','Unknown physical choice may affect index DDL');
  const payload=getBinding(binding,logical);
  if(payload.target.system!=='postgresql'||!/^17(?:\.|$)/.test(payload.target.version))throw new UmfError('BINDING_TARGET','Expected pinned PostgreSQL 17 binding');
  const declarations=getPostgresqlDdlDeclarations(nativeArchive);
  if(declarations.status==='blocked')throw new UmfError('POSTGRESQL_INDEX_SOURCE','Native CREATE TABLE declarations unavailable');
  const tables=new Map<string,{columns:Map<string,string>;partitionKeys:string[]}>();
  for(const row of declarations.declarations.filter(d=>d.kind==='create-table')){
    const relation=JSON.parse(renderTree(row.relation)) as {relname?:string;schemaname?:string};
    if(!relation.relname)continue;
    const statement=JSON.parse(renderTree(row.nativeStatement)) as {partspec?:{partParams?:{PartitionElem?:{name?:string}}[]}};
    const columns=new Map<string,string>();
    for(const col of row.columns){
      const value=JSON.parse(renderTree(col.nativeColumn)) as {colname:string;typeName?:{names?:{String?:{sval:string}}[]}};
      const type=value.typeName?.names?.map(n=>n.String?.sval).filter(Boolean).join('.');
      if(type)columns.set(value.colname,type);
    }
    const table=relation.schemaname?relation.schemaname+'.'+relation.relname:relation.relname;
    tables.set(table,{columns,partitionKeys:(statement.partspec?.partParams??[]).map(p=>p.PartitionElem?.name).filter((name):name is string=>!!name)});
  }
  const residuals:PostgresqlBindingResidual[]=[];
  const add=(path:string,reason:string,choice:unknown)=>residuals.push({path,reason,choice:copyJson(choice)});
  const statements:string[]=[];
  for(const [i,item] of payload.indexes.entries()){
    const path=`/extensions/umf.binding/indexes/${i}`;
    if(item.kind==='clustering'){add(path,'PostgreSQL physical clustering is not this declared index kind',item);continue;}
    if(item.predicate&&(item.predicate.language!=='postgresql'||!/^17(?:\.|$)/.test(item.predicate.version))){add(path,'Predicate language/version differs from PostgreSQL 17 profile',item);continue;}
    if(item.unique&&!['btree','unique','expression','partial'].includes(item.kind)){add(path,'Unique enforcement for this access method is outside the verified profile',item);continue;}
    if(item.include?.length&&['gin','hash'].includes(item.kind)){add(path,'Included columns are outside this access-method profile',item);continue;}
    const refs=item.on.map(t=>'field'in t?t.field:t.documentPath.field);
    const owner=refs[0]!;
    const element=payload.elements.find(e=>e.module===owner.module&&e.element===owner.element);
    const table=element?.table;
    if(!table||!tables.has(table)){add(path,'Index owner needs an exact table override in native source',item);continue;}
    const {columns,partitionKeys}=tables.get(table)!;
    let valid=true;
    const terms=item.on.map(target=>{
      const ref='field'in target?target.field:target.documentPath.field;
      const field=payload.fields.find(row=>same(row,ref));
      if(!field){valid=false;return '';}
      if('field'in target){
        if(!field.column||!columns.has(field.column)){valid=false;return '';}
        return quote(field.column);
      }
      if(field.storage!=='embedded'||!field.documentColumn||columns.get(field.documentColumn)!=='jsonb'||JSON.stringify(field.path)!==JSON.stringify(target.documentPath.path)){valid=false;return '';}
      const segments=target.documentPath.path.map(literal).join(',');
      return `(${quote(field.documentColumn)} #>> ARRAY[${segments}]::text[])`;
    });
    const includes=(item.include??[]).map(ref=>{
      const field=payload.fields.find(row=>same(row,ref));
      if(!field?.column||!columns.has(field.column)){valid=false;return '';}
      return quote(field.column);
    });
    if(!valid){add(path,'Index field or JSONB document column is absent from native table',item);continue;}
    const indexedColumns=item.on.flatMap(target=>{
      if(!('field'in target))return [];
      const field=payload.fields.find(row=>same(row,target.field));
      return field?.column?[field.column]:[];
    });
    if(item.unique&&partitionKeys.some(column=>!indexedColumns.includes(column))){add(path,'Unique index on a partitioned table must include every partition key',item);continue;}
    if(['gin','gist'].includes(item.kind)){
      const supported=item.on.every(target=>{
        if(!('field'in target))return false;
        const field=payload.fields.find(row=>same(row,target.field));
        const type=field?.column&&columns.get(field.column)?.split('.').at(-1);
        return item.kind==='gin'?type==='jsonb':type==='point';
      });
      if(!supported){add(path,'No verified default operator class for this index method and column type',item);continue;}
    }
    const method=['btree','hash','gin','gist'].includes(item.kind)?item.kind:'btree';
    const predicate=item.predicate?.expression;
    if(predicate&&(/;|--|\/\*/.test(predicate)||predicate.trim()==='')){add(path,'Predicate is outside the single-expression SQL subset',item);continue;}
    const targetTable=table.split('.').map(quote).join('.');
    const sql=`CREATE ${item.unique?'UNIQUE ':''}INDEX ${quote(item.name)} ON ${targetTable} USING ${method} (${terms.join(', ')})${includes.length?' INCLUDE ('+includes.join(', ')+')':''}${predicate?' WHERE ('+predicate+')':''};`;
    try{
      const tree=await backend.parse(sql) as {stmts?:{stmt?:Record<string,unknown>}[]};
      if(tree.stmts?.length!==1||!tree.stmts[0]?.stmt||!Object.hasOwn(tree.stmts[0].stmt,'IndexStmt'))throw Error('Not one CREATE INDEX statement');
      const doc=await importPostgresqlSql(sql,backend,{id:`binding-index-${i}`});
      await exportPostgresqlSql(doc,backend);
      statements.push(sql);
    }catch{add(path,'Index DDL fails pinned PostgreSQL parser/deparser/codec',item);}
  }
  const status=residuals.length?(lossPolicy==='strict'?'blocked':'reported'):'proposed';
  return {status,logical:copyJson(logical) as unknown as Document,binding:copyJson(binding) as unknown as Document,nativeArchive:copyJson(nativeArchive) as unknown as Document,target:copyJson(payload.target) as BindingPayload['target'],residuals,...(status!=='blocked'&&statements.length?{candidate:statements.join('\n')+'\n'}:{})};
}
