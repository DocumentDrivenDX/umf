import {copyJson} from '../../model/json';
import {UmfError,type Document} from '../../model/types';
import {getBinding,inspectBinding,projectBindingIndexes,type BindingPayload} from '../../extensions/binding';
import {exportIcebergTable,importIcebergTable,inspectIcebergTable} from '../../adapters/iceberg/table';
import {inspectIcebergTableContext} from '../../adapters/iceberg/table-context';

export interface IcebergBindingResidual {path:string;reason:string;choice:unknown}
export interface IcebergBindingProjection {
  status:'blocked'|'reported'|'projected';logical:Document;binding:Document;nativeArchive:Document;
  target:BindingPayload['target'];residuals:IcebergBindingResidual[];
  /** Complete metadata proposal only; no catalog commit or sorted data-file claim. */
  candidate?:string;
}

/** Maps clustering to a v2/v3 default sort-order hint, with an explicit approximation residual. */
export function projectBindingToIceberg(logical:Document,binding:Document,nativeArchive:Document,lossPolicy:'strict'|'report'):IcebergBindingProjection{
  if(inspectBinding(binding,logical).diagnostics.some(d=>d.code==='BINDING_UNKNOWN'))throw new UmfError('BINDING_INCOMPLETE','Unknown binding content may affect Iceberg projection');
  const payload=getBinding(binding,logical);
  if(payload.target.system!=='iceberg'||!['2','3'].includes(payload.target.version.split('.')[0]!))throw new UmfError('BINDING_TARGET','Expected pinned Iceberg v2 or v3 metadata profile');
  if(!inspectIcebergTable(nativeArchive).valid||inspectIcebergTableContext(nativeArchive).status==='blocked')throw new UmfError('ICEBERG_BINDING_SOURCE','Native table metadata has invalid current references');
  const metadata=JSON.parse(exportIcebergTable(nativeArchive)) as Record<string,any>;
  if(String(metadata['format-version'])!==payload.target.version.split('.')[0])throw new UmfError('BINDING_TARGET','Iceberg format version differs from binding target');
  const current=metadata.schemas?.find((s:{'schema-id':number})=>s['schema-id']===metadata['current-schema-id']);
  if(!current)throw new UmfError('ICEBERG_BINDING_SCHEMA','Missing current Iceberg schema');
  const columns=new Map<string,number>(current.fields.map((f:{id:number;name:string})=>[f.name,f.id]));
  const residuals:IcebergBindingResidual[]=[];
  const add=(path:string,reason:string,choice:unknown)=>residuals.push({path,reason,choice:copyJson(choice)});
  payload.elements.forEach((row,i)=>{
    if(row.partition!==undefined)add(`/extensions/umf.binding/elements/${i}/partition`,'Partition family needs a separately declared Iceberg partition transform',row.partition);
    if(row.table!==undefined)add(`/extensions/umf.binding/elements/${i}/table`,'Table name belongs to catalog context, not metadata JSON',row.table);
  });
  payload.fields.forEach((row,i)=>{
    if(row.storage==='embedded')add(`/extensions/umf.binding/fields/${i}`,'Embedded path needs an independently verified Iceberg nested field mapping',row);
    else if(!columns.has(row.column!))add(`/extensions/umf.binding/fields/${i}`,'Storage column is absent from current Iceberg schema',row);
  });
  payload.relationships.forEach((row,i)=>add(`/extensions/umf.binding/relationships/${i}`,'Iceberg table metadata does not enforce relationship storage',row));
  const indexReport=projectBindingIndexes(binding,logical,'report');
  indexReport.outcomes.forEach((outcome,i)=>{if(outcome.outcome!=='exact')add(outcome.path,outcome.reason??'No exact index carrier',payload.indexes[i]);});
  const clustering=payload.indexes.map((item,i)=>({item,i})).filter(x=>x.item.kind==='clustering'&&indexReport.outcomes[x.i]?.outcome==='approximated');
  if(clustering.length>1)for(const {item,i} of clustering)add(`/extensions/umf.binding/indexes/${i}`,'One table has one default sort-order selection',item);
  let candidate:string|undefined;
  if(clustering.length===1){
    const {item,i}=clustering[0]!;
    const fields:{transform:string;'source-id':number;direction:'asc';'null-order':'nulls-first'}[]=[];
    for(const target of item.on){
      if(!('field'in target))continue;
      const field=payload.fields.find(row=>row.module===target.field.module&&row.element===target.field.element&&row.field===target.field.field);
      const sourceId=field?.column?columns.get(field.column):undefined;
      if(sourceId===undefined)add(`/extensions/umf.binding/indexes/${i}`,'Sort target has no current Iceberg source field ID',item);
      else fields.push({transform:'identity','source-id':sourceId,direction:'asc','null-order':'nulls-first'});
    }
    if(fields.length===item.on.length){
      const orderId=Math.max(0,...metadata['sort-orders'].map((row:{'order-id':number})=>row['order-id']))+1;
      metadata['sort-orders'].push({'order-id':orderId,fields});
      metadata['default-sort-order-id']=orderId;
      candidate=JSON.stringify(metadata)+'\n';
      const proposed=importIcebergTable(candidate,{id:'iceberg-sort-proposal'});
      if(!inspectIcebergTable(proposed).valid||inspectIcebergTableContext(proposed).status==='blocked')throw new UmfError('ICEBERG_BINDING_CANDIDATE','Generated metadata failed adapter validation');
    }
  }
  const status=residuals.length?(lossPolicy==='strict'?'blocked':'reported'):'projected';
  return {status,logical:copyJson(logical) as unknown as Document,binding:copyJson(binding) as unknown as Document,nativeArchive:copyJson(nativeArchive) as unknown as Document,target:copyJson(payload.target) as BindingPayload['target'],residuals,...(status!=='blocked'&&candidate?{candidate}:{})};
}
