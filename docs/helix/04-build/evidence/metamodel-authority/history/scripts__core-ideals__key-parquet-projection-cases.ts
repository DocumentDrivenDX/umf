import {avroKeyProjectionCases} from './key-avro-projection-cases';
import type {KeyParquetRequest} from '../../src/core-ideals/key-parquet-projection';
import type {ParquetFacetCarrier} from '../../src/core-ideals/parquet-facet-carrier';
/** Shared authored-key vectors; Parquet's physical choices are explicit and independent. */
export function parquetKeyProjectionCases(){
 const rows=avroKeyProjectionCases().map(c=>{
  const columns:KeyParquetRequest['columns']=c.request.columns.map((column,index)=>{
   const element=c.source.modules.find(m=>m.id===column.field.module)!.elements.find(e=>e.id===column.field.element)!;
   let carrier:ParquetFacetCarrier;
   if(column.nativeType==='decimal-bytes'){const f=element.facets as {precision:number;scale:number};carrier={kind:'decimal',carrier:'int64',precision:f.precision,scale:f.scale};}
   else carrier={kind:'primitive',nativeType:({boolean:'boolean',int:'int32',long:'int64',bytes:'binary',string:'string',float:'float32',double:'float64'} as const)[column.nativeType]};
   if(index===0&&c.name==='integer-width')carrier={kind:'integer',bits:8,signed:true};
   if(index===0&&c.name==='unsigned')carrier={kind:'integer',bits:64,signed:false};
   return {field:column.field,name:column.name,carrier,fieldId:index+17};
  });
  const request:KeyParquetRequest={id:'parquet-key-native',record:c.request.record,recordName:c.request.recordName,mode:c.request.mode,columns};
  return {...c,request,expected:c.name==='quoted-identifiers'?'projected' as const:c.expected};
 });
 const fixed=structuredClone(rows.find(r=>r.name==='binary')!);fixed.name='fixed-binary';fixed.request.columns[0]!.carrier={kind:'fixed',bytes:2};rows.push(fixed);
 for(const carrier of ['int32','bytes','fixed'] as const){const c=structuredClone(rows.find(r=>r.name==='decimal')!);c.name='decimal-'+carrier;c.request.columns[0]!.carrier={kind:'decimal',carrier,precision:5,scale:2,...(carrier==='fixed'?{bytes:4}:{})};rows.push(c);}
 return rows;
}
export function parquetKeyAuthors(){const c=parquetKeyProjectionCases().find(c=>c.name==='primary-report')!;return {source:c.source,authors:c.authors,request:c.request};}
