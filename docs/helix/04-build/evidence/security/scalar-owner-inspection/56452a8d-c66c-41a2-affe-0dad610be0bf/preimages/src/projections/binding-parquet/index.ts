import {copyJson} from '../../model/json';
import {getBinding,inspectBinding,type BindingPayload} from '../../extensions/binding';
import {exportParquetCapture} from '../../adapters/parquet';
import {UmfError,type Document} from '../../model/types';

export interface ParquetBindingResidual {path:string;reason:string;choice:unknown}
export interface ParquetBindingReport {
  status:'blocked'|'reported'|'preserved';
  logical:Document;
  binding:Document;
  target:BindingPayload['target'];
  residuals:ParquetBindingResidual[];
  nativeArchive?:Document;
}

/** Parquet's initial file-schema profile preserves physical choices as residuals. */
export function projectBindingToParquet(logical:Document,binding:Document,lossPolicy:'strict'|'report',nativeArchive?:Document):ParquetBindingReport{
  if(inspectBinding(binding,logical).diagnostics.some(d=>d.code==='BINDING_UNKNOWN'))throw new UmfError('BINDING_INCOMPLETE','Unknown binding content may affect Parquet projection');
  const payload=getBinding(binding,logical);
  if(payload.target.system!=='parquet')throw new UmfError('BINDING_TARGET','Expected Parquet target binding');
  if(!/^2(?:\.|$)/.test(payload.target.version))throw new UmfError('BINDING_TARGET','Unsupported Parquet profile version');
  if(nativeArchive)exportParquetCapture(nativeArchive);
  const residuals:ParquetBindingResidual[]=[];
  const add=(path:string,reason:string,choice:unknown)=>residuals.push({path,reason,choice:copyJson(choice)});
  payload.elements.forEach((row,index)=>{
    if(row.partition!==undefined)add(`/extensions/umf.binding/elements/${index}/partition`,'Parquet file schema does not declare partition family',row.partition);
    if(row.table!==undefined)add(`/extensions/umf.binding/elements/${index}/table`,'Parquet file schema does not declare table name',row.table);
  });
  payload.fields.forEach((row,index)=>add(`/extensions/umf.binding/fields/${index}`,'Parquet file schema does not enforce this storage placement',row));
  payload.relationships.forEach((row,index)=>add(`/extensions/umf.binding/relationships/${index}`,'Parquet file schema does not enforce relationship storage',row));
  payload.indexes.forEach((row,index)=>add(`/extensions/umf.binding/indexes/${index}`,'Parquet file schema does not enforce indexes',row));
  const status=residuals.length?(lossPolicy==='strict'?'blocked':'reported'):'preserved';
  return {status,logical:copyJson(logical) as unknown as Document,binding:copyJson(binding) as unknown as Document,target:copyJson(payload.target) as BindingPayload['target'],residuals,...(nativeArchive?{nativeArchive:copyJson(nativeArchive) as unknown as Document}:{})};
}
