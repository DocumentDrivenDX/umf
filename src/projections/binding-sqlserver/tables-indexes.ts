import {renderTree} from '../../model/native-json';
import {UmfError,type Document} from '../../model/types';
import {getBinding,type BindingFieldRef} from '../../extensions/binding';
import {getSqlServerColumnMetadata} from '../../adapters/sqlserver';
import {projectBindingIndexesToSqlServer} from './indexes';
import {projectBindingTablesToSqlServer,type SqlServerTablePolicy,type SqlServerTableProjection} from './tables';

const key=(ref:BindingFieldRef)=>JSON.stringify([ref.module,ref.element,ref.field??null]);
const nativeType=(value:string)=>{
  const normalized=value.toLowerCase().replace(/\s+/g,'');
  const text=/^(nvarchar|varbinary)\((max|[1-9][0-9]*)\)$/.exec(normalized);
  if(text)return {name:text[1],length:text[2]==='max'?-1:Number(text[2])*(text[1]==='nvarchar'?2:1)};
  return {name:normalized.split('(')[0],length:undefined};
};

/** Relationship-independent SQL Server table/index stage, checked against an explicit native catalog. */
export function projectBindingTablesAndIndexesToSqlServer(logical:Document,binding:Document,policy:SqlServerTablePolicy,nativeSource:string,lossPolicy:'strict'|'report'):SqlServerTableProjection{
  const tables=projectBindingTablesToSqlServer(logical,binding,policy,'report',nativeSource);
  const {candidate:_tableCandidate,...base}=tables;
  if(!tables.candidate||!tables.nativeArchive)return {...base,status:'blocked'};
  const payload=getBinding(binding,logical);
  const native=new Map(getSqlServerColumnMetadata(tables.nativeArchive).map(row=>{
    const column=JSON.parse(renderTree(row.nativeColumn)) as {base_type_name:string;max_length:number};
    return [JSON.stringify([row.table.schema,row.table.name,row.element.name]),column] as const;
  }));
  const types=new Map(policy.fieldTypes.map(row=>[key(row),nativeType(row.sqlType)]));
  const used=new Set(payload.indexes.filter(index=>['btree','unique','partial'].includes(index.kind)).flatMap(index=>[
    ...index.on.flatMap(target=>'field'in target?[key(target.field)]:[]),
    ...(index.include??[]).map(key),
  ]));
  for(const [index,field] of payload.fields.entries()){
    if(!used.has(key(field)))continue;
    const owner=payload.elements.find(e=>e.module===field.module&&e.element===field.element),parts=owner?.table?.split('.');
    if(!parts||parts.length!==2)throw new UmfError('SQLSERVER_TABLE_PLAN','Index owner has no emitted table');
    const columnName=field.storage==='embedded'?field.documentColumn:field.column;
    if(!columnName||!tables.mappings.some(row=>row.sourcePath===`/extensions/umf.binding/fields/${index}`&&row.target===owner!.table+'.'+columnName))
      throw new UmfError('SQLSERVER_TABLE_PLAN','Index column is absent from generated table plan');
    const observed=native.get(JSON.stringify([parts[0],parts[1],columnName]));
    const expected=field.storage==='embedded'?{name:'nvarchar',length:-1}:types.get(key(field));
    if(!observed||!expected||observed.base_type_name.toLowerCase()!==expected.name||(expected.length!==undefined&&observed.max_length!==expected.length))
      throw new UmfError('SQLSERVER_TABLE_CATALOG','Native catalog does not match the generated table column '+owner!.table+'.'+columnName);
  }
  const indexes=projectBindingIndexesToSqlServer(logical,binding,tables.nativeArchive,nativeSource,'report');
  const residuals=[...tables.residuals.filter(row=>!row.path.startsWith('/extensions/umf.binding/indexes/')),...indexes.residuals];
  const candidate=tables.candidate+(indexes.candidate??'');
  const status=residuals.length?(lossPolicy==='strict'?'blocked':'reported'):'proposed';
  return {...base,status,residuals,...(status==='blocked'?{}:{candidate})};
}
