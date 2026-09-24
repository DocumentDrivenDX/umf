import {renderTree} from '../../model/native-json';
import {UmfError,type Document} from '../../model/types';
import {getBinding,type BindingFieldRef} from '../../extensions/binding';
import {getSqlServerColumnMetadata} from '../../adapters/sqlserver';
import {projectBindingIndexesAgainstSqlServerPlan,projectBindingIndexesToSqlServer,type SqlServerPlannedColumn} from './indexes';
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

/** Generate relationship-independent SQL Server DDL from authored inputs; catalog evidence is optional. */
export function projectBindingTablesAndIndexesFromPlanToSqlServer(logical:Document,binding:Document,policy:SqlServerTablePolicy,lossPolicy:'strict'|'report',nativeSource?:string):SqlServerTableProjection{
  const tables=projectBindingTablesToSqlServer(logical,binding,policy,'report',nativeSource);
  const {candidate:_tableCandidate,...base}=tables;
  if(!tables.candidate)return {...base,status:'blocked'};
  const payload=getBinding(binding,logical),types=new Map(policy.fieldTypes.map(row=>[key(row),nativeType(row.sqlType)]));
  const planned:SqlServerPlannedColumn[]=[];
  for(const [i,field] of payload.fields.entries()){
    const owner=payload.elements.find(e=>e.module===field.module&&e.element===field.element),parts=owner?.table?.split('.');
    const column=field.storage==='embedded'?field.documentColumn:field.column;
    if(!parts||parts.length!==2||!column)continue;
    if(!tables.mappings.some(row=>row.sourcePath===`/extensions/umf.binding/fields/${i}`&&row.target===owner!.table+'.'+column))continue;
    const expected=field.storage==='embedded'?{name:'nvarchar',length:-1}:types.get(key(field));
    if(!expected)throw new UmfError('SQLSERVER_TABLE_PLAN','Emitted field has no explicit SQL type');
    if(!planned.some(row=>row.schema===parts[0]&&row.table===parts[1]&&row.column===column))planned.push({schema:parts[0]!,table:parts[1]!,column,maxLength:expected.length??0});
  }
  const indexes=projectBindingIndexesAgainstSqlServerPlan(logical,binding,planned,'report');
  const residuals=[...tables.residuals.filter(row=>!row.path.startsWith('/extensions/umf.binding/indexes/')),...indexes.residuals];
  const candidate=tables.candidate+(indexes.candidate??'');
  if(nativeSource!==undefined){
    const checked=projectBindingTablesAndIndexesToSqlServer(logical,binding,policy,nativeSource,'report');
    if(checked.candidate!==candidate)throw new UmfError('SQLSERVER_TABLE_CATALOG','Catalog and generated plan disagree on index DDL');
  }
  const status=residuals.length?(lossPolicy==='strict'?'blocked':'reported'):'proposed';
  return {...base,status,residuals,...(status==='blocked'?{}:{candidate})};
}
