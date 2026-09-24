import {copyJson} from '../../model/json';
import {parseNativeJson,renderTree} from '../../model/native-json';
import {UmfError,type Document} from '../../model/types';
import {getBinding,inspectBinding,type BindingFieldRef,type BindingPayload} from '../../extensions/binding';
import {exportSqlServerCatalog,getSqlServerColumnMetadata} from '../../adapters/sqlserver';

export interface SqlServerBindingResidual {path:string;reason:string;choice:unknown}
export interface SqlServerIndexProjection {
  status:'blocked'|'reported'|'proposed';logical:Document;binding:Document;nativeArchive:Document;nativeSource:string;
  target:BindingPayload['target'];residuals:SqlServerBindingResidual[];candidate?:string;
}
const quote=(s:string)=>{
  if(!s||new TextEncoder().encode(s).length>128||/[\0\uD800-\uDFFF]/u.test(s))throw new UmfError('SQLSERVER_IDENTIFIER','Invalid or truncated SQL Server identifier');
  return '['+s.replace(/]/g,']]')+']';
};
const same=(a:BindingFieldRef,b:BindingFieldRef)=>a.module===b.module&&a.element===b.element&&a.field===b.field;

/** SQL Server 2022 disk-based rowstore index proposal; native server oracle proves the pinned corpus. */
export function projectBindingIndexesToSqlServer(logical:Document,binding:Document,nativeArchive:Document,nativeSource:string,lossPolicy:'strict'|'report'):SqlServerIndexProjection{
  if(inspectBinding(binding,logical).diagnostics.some(d=>d.code==='BINDING_UNKNOWN'))throw new UmfError('BINDING_INCOMPLETE','Unknown physical choice may affect SQL Server index DDL');
  const payload=getBinding(binding,logical);
  if(payload.target.system!=='sqlserver'||payload.target.version!=='2022')throw new UmfError('BINDING_TARGET','Expected pinned SQL Server 2022 binding');
  if(typeof nativeSource!=='string'||renderTree(parseNativeJson(nativeSource))!==exportSqlServerCatalog(nativeArchive).trimEnd())throw new UmfError('SQLSERVER_SOURCE','Native source and retained catalog differ');
  const nativeColumns=getSqlServerColumnMetadata(nativeArchive);
  const residuals:SqlServerBindingResidual[]=[],statements:string[]=[];
  const add=(path:string,reason:string,choice:unknown)=>residuals.push({path,reason,choice:copyJson(choice)});
  for(const [i,item] of payload.indexes.entries()){
    const path=`/extensions/umf.binding/indexes/${i}`;
    if(!['btree','unique','partial'].includes(item.kind)){add(path,'No verified disk-rowstore carrier for this index kind',item);continue;}
    if(item.predicate&&(item.predicate.language!=='tsql'||item.predicate.version!=='2022')){add(path,'Predicate language/version differs from SQL Server 2022 profile',item);continue;}
    if(item.on.some(target=>'documentPath'in target)){add(path,'Document-path expression index needs an explicit computed column outside this profile',item);continue;}
    const first=item.on[0];if(!first||!('field'in first)){add(path,'No direct field target',item);continue;}
    const element=payload.elements.find(e=>e.module===first.field.module&&e.element===first.field.element);
    const parts=element?.table?.split('.');
    if(!parts||parts.length!==2||parts.some(x=>!x)){add(path,'An exact schema.table override is required',item);continue;}
    const [schema,table]=parts as [string,string];
    const tableColumns=nativeColumns.filter(c=>c.table.schema===schema&&c.table.name===table);
    const available=new Set(tableColumns.map(c=>c.element.name));
    if(!available.size){add(path,'Native catalog has no matching table columns',item);continue;}
    let valid=true;
    const terms=item.on.map(target=>{
      if(!('field'in target)){valid=false;return '';}
      const field=payload.fields.find(row=>same(row,target.field));
      if(!field?.column||!available.has(field.column)){valid=false;return '';}
      return quote(field.column);
    });
    const includes=(item.include??[]).map(ref=>{
      const field=payload.fields.find(row=>same(row,ref));
      if(!field?.column||!available.has(field.column)){valid=false;return '';}
      return quote(field.column);
    });
    if(!valid){add(path,'Index column or include is absent from native catalog',item);continue;}
    const unboundedKey=item.on.some(target=>{
      if(!('field'in target))return false;
      const field=payload.fields.find(row=>same(row,target.field));
      const column=tableColumns.find(row=>row.element.name===field?.column);
      return column?JSON.parse(renderTree(column.nativeColumn)).max_length===-1:false;
    });
    if(unboundedKey){add(path,'Unbounded native column cannot be a key in this disk-rowstore profile',item);continue;}
    const predicate=item.predicate?.expression;
    const predicateMatch=predicate&&/^\[([A-Za-z_][A-Za-z0-9_]*)\]\s*(?:=|<>|<=|>=|<|>)\s*(?:-?\d+|N?'(?:[^']|'')*')$/i.exec(predicate.trim());
    if(predicate&&!predicateMatch){add(path,'Filtered predicate is outside the verified simple comparison subset',item);continue;}
    if(predicateMatch&&!available.has(predicateMatch[1]!)){add(path,'Filtered predicate column is absent from native catalog',item);continue;}
    const sql=`CREATE ${item.unique?'UNIQUE ':''}NONCLUSTERED INDEX ${quote(item.name)} ON ${quote(schema)}.${quote(table)} (${terms.join(', ')})${includes.length?' INCLUDE ('+includes.join(', ')+')':''}${predicate?' WHERE '+predicate.trim():''};`;
    statements.push(sql);
  }
  const status=residuals.length?(lossPolicy==='strict'?'blocked':'reported'):'proposed';
  return {status,logical:copyJson(logical) as unknown as Document,binding:copyJson(binding) as unknown as Document,nativeArchive:copyJson(nativeArchive) as unknown as Document,nativeSource,target:copyJson(payload.target) as BindingPayload['target'],residuals,...(status!=='blocked'&&statements.length?{candidate:statements.join('\n')+'\n'}:{})};
}
