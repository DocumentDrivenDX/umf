import {shapeAvro,shapeParquet} from './model-shape-schema';
import {UmfError,type Json} from '../model/types';
import type {Resolved128Layout,Resolved128Field} from '../extensions/binding/bit128-layout';
import type {Bit128ModelResidual} from './bit128-sql-model';
export interface Bit128FileField {field:Resolved128Field;name:string;paired:boolean}
export function bit128FileFields(fields:Resolved128Field[]):Bit128FileField[]{
 const rows=fields.map(field=>({field,name:field.carrier.kind==='words64'?field.carrier.highColumn+'__pair':field.slots[0]!,paired:field.carrier.kind==='words64'}));
 if(new Set(rows.map(r=>r.name)).size!==rows.length)throw new UmfError('BIT128_FILE_COLLISION','Native pair group and scalar names collide');
 return rows;
}
const avroName=(n:string)=>{if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n)||['null','boolean','int','long','float','double','bytes','string'].includes(n))throw new UmfError('BIT128_AVRO_NAME','Invalid native Avro name');return n;};
export function renderBit128FileModel(layout:Resolved128Layout,system:'avro'|'parquet'|'tablespec',residuals:Bit128ModelResidual[]):string {
 const records=layout.records.map((r,ri)=>{
  const fields=bit128FileFields(r.fields);
  if(system==='tablespec'){
   if(!/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(r.table))throw new UmfError('BIT128_TABLESPEC_NAME','TableSpec requires bounded identifiers');
   const columns=fields.map(({field:f,name})=>{
    if(!/^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(name))throw new UmfError('BIT128_TABLESPEC_NAME','TableSpec requires bounded identifiers');
    if(!['json','scalar','uuid-text','hex128-text'].includes(f.carrier.kind))throw new UmfError('BIT128_TABLESPEC_CARRIER','Selected TableSpec target admits only the explicit canonical string fallback');
    return {name,data_type:'VARCHAR',...(['scalar','json'].includes(f.carrier.kind)?{}:{length:f.carrier.kind==='uuid-text'?36:32}),nullable:{default:f.field.nullability!=='required'}};
   });
   const keySlots=(k:typeof r.keys[number])=>k.fields.flatMap(ref=>r.fields.find(f=>f.identity.module===ref.module&&f.identity.element===ref.element)!.slots);
   return {version:'1.0',table_name:r.table,columns,...(r.keys.find(k=>k.primary)?{primary_key:keySlots(r.keys.find(k=>k.primary)!)}:{}),...(r.keys.some(k=>!k.primary)?{unique_constraints:r.keys.filter(k=>!k.primary).map(keySlots)}:{})};
  }
  const nativeFields=fields.map(({field:f,name,paired},fi)=>{
   const c=f.carrier,required=f.field.nullability==='required';
   if(system==='avro'){
    avroName(name);for(const n of f.slots)avroName(n);
    if(c.kind==='words64'&&!c.signed)throw new UmfError('BIT128_AVRO_UNSIGNED','Avro long cannot store unsigned64');
    const unique=`umf_${ri}_${fi}`;
    if(c.kind==='json')return {name,type:shapeAvro(c.shape,`composition_${ri}_${fi}`)};
    const primitive:Json=c.kind==='words64'?{type:'record',name:unique+'_pair',namespace:`umf.model.r${ri}.values`,fields:f.slots.map(name=>({name,type:'long'}))}:c.kind==='native-uuid'?{type:'fixed',name:unique+'_uuid',namespace:`umf.model.r${ri}.values`,size:16,logicalType:'uuid'}:c.kind==='bytes16'?{type:'fixed',name:unique+'_bytes',namespace:`umf.model.r${ri}.values`,size:16}:c.kind==='uuid-text'?{type:'string',logicalType:'uuid'}:'string';
    return {name,type:required?primitive:['null',primitive]};
   }
   if(!name||name.includes('\0'))throw new UmfError('BIT128_PARQUET_NAME','Invalid native Parquet name');
   if(c.kind==='json')return shapeParquet(c.shape,name);
   return paired?{name,nullable:!required,children:f.slots.map(name=>({name,nullable:false,physicalType:'INT64',logicalType:'INTEGER',bitWidth:64,isSigned:c.kind==='words64'&&c.signed}))}:{name,nullable:!required,physicalType:c.kind==='native-uuid'||c.kind==='bytes16'?'FIXED_LEN_BYTE_ARRAY':'BYTE_ARRAY',...(c.kind==='native-uuid'||c.kind==='bytes16'?{length:16}:{}),logicalType:c.kind==='native-uuid'?'UUID':c.kind==='bytes16'?null:'STRING'};
  });
  if(system==='avro'){avroName(r.table);return {type:'record',name:r.table,namespace:`umf.model.r${ri}`,fields:nativeFields};}
  return {name:r.table,columns:nativeFields};
 });
 for(const [ri,r] of layout.records.entries()){
  for(const f of r.fields){
   if(f.carrier.kind==='json')residuals.push({path:JSON.stringify(f.identity),reason:'Recursive composite domains and collection bounds require complete-value codec validation; SQL/TableSpec JSON text and nested file tokens preserve structure without native equivalence'});
   if(['scalar','uuid-text','hex128-text'].includes(f.carrier.kind)||system==='tablespec')residuals.push({path:JSON.stringify(f.identity),reason:system==='tablespec'?'Native TableSpec/Spark strings do not enforce canonical grammar or CSV requiredness; complete-row codec validation is required':'Exact-text scalar storage does not enforce logical scalar semantics, grammar or arithmetic; complete-row codec validation is required'});
   if(f.field.default!==undefined||f.field.allowedValues!==undefined||f.field.facets!==undefined)residuals.push({path:JSON.stringify(f.identity),reason:'Native Field constraints/defaults are retained and checked by codecs, not enforced by this file schema'});
   if(system==='avro'&&f.carrier.kind==='native-uuid')residuals.push({path:JSON.stringify(f.identity),reason:'Apache Avro1.12 ignores fixed UUID logical annotation; exact fixed16 data survives'});
  }
  if(r.keys.length)residuals.push({path:`/records/${ri}/keys`,reason:'Native file/model schema does not enforce collection uniqueness; logical Keys remain in source'});
 }
 for(const {layout:a} of layout.associations??[])residuals.push({path:'/relationships/'+a.module+'/'+a.id,reason:'Association identity/attributes and endpoint mappings are retained; native file/model schemas do not enforce endpoint choice, integrity, distinct-endpoint multiplicity or lifecycle'});
 for(const r of layout.relationships)residuals.push({path:`/relationships/${r.layout.module}/${r.layout.id}`,reason:'Native file/model storage does not enforce referenced row existence, cardinality or lifecycle'});
 for(const {index} of layout.indexes)residuals.push({path:'/indexes/'+index.name,reason:'Native file/model layout does not implement authored secondary indexes'});
 return JSON.stringify({profile:'umf-128-native-model/1',system,records});
}
