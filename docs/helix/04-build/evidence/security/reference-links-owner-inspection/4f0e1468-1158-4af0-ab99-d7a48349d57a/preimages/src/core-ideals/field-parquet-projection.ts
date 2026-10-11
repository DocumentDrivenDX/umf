import {parquetCarriers,parquetFieldFile} from './parquet-carriers';
import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from '../model/field-kind';
import {exportParquetCapture} from '../adapters/parquet';
import {importParquetSchema,getParquetFieldMetadata} from '../adapters/parquet/field-metadata';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import kinds from '../../spec/core/kind-operation.schema.json';
import schema from '../../spec/core/field-parquet-projection.schema.json';
export {default as fieldParquetProjectionSchema} from '../../spec/core/field-parquet-projection.schema.json';
export interface FieldParquetRequest {id:string;recordName:string;repetition:'required'|'optional'|'repeated';fieldName:string;nativeType:keyof typeof parquetCarriers;mode:'strict'|'report'}
const binding={id:'umf.core.field.parquet',version:'1.0.0',nativeVersion:'parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017',subset:'Single authored Field, explicit carrier and repetition in an empty schema file; no row writing or value-domain equivalence'} as const;
export interface FieldParquetProjection {
 operation:'project-field-parquet';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreKindDeclaration;request:FieldParquetRequest;target?:Document;binding:typeof binding;diagnostics:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativePath:'/schema/1';outcome:'exact'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(kinds);const check=validator.compile(schema);
const checkRequest=validator.compile({...schema.properties.request});
export function projectFieldToParquet(input:CoreKindDeclaration,options:FieldParquetRequest):FieldParquetProjection & {diagnostics:Diagnostic[]} {
 const copied=copyJson(input) as unknown as CoreKindDeclaration;
 const author=verifyCoreKindDeclaration(copied,copied.target),source=copyJson(author.target) as unknown as Document,request=copyJson(options) as unknown as FieldParquetRequest;
 if(!checkRequest(request))throw new UmfError('FIELD_PARQUET_REQUEST',JSON.stringify(checkRequest.errors));
 const mi=source.modules.findIndex(m=>m.id===author.identity.module),module=source.modules[mi]!,ei=module.elements.findIndex(e=>e.id===author.identity.element),element=module.elements[ei]!,path=`/modules/${mi}/elements/${ei}`;
 const result:FieldParquetProjection={operation:'project-field-parquet',version:'1.0.0',status:'projected',source,author,request,binding,mapping:{origin:'authored',idealPath:path+'/kind',nativePath:'/schema/1',outcome:'exact'},residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'='unknown')=>result.residuals.push({path,value:copyJson(value),reason,outcome,recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'});
 if(author.provenance.kind!=='field')loss(path+'/kind',element.kind,'Record/group is not a single native column','not-expressible');
 if(element.name!==undefined&&element.name!==request.fieldName)loss(path+'/name',element.name,'Explicit native column name differs from ideal name','not-expressible');
 // Closed projection scope: every source property outside the implemented mapping is disclosed.
 for(const [key,value] of Object.entries(source))if(!['umf','id','modules','vocabularies'].includes(key))loss('/'+pointer(key),value,'Document metadata is retained but not projected');
 if(Object.keys(source.vocabularies).length)loss('/vocabularies',source.vocabularies,'Native vocabulary semantics are not projected');
 source.modules.forEach((m,i)=>{
  if(i!==mi){loss('/modules/'+i,m,'Other module is outside selected Field projection');return;}
  if(m.namespace)loss(`/modules/${i}/namespace`,m.namespace,'Parquet root name does not preserve ideal namespace');
  for(const [key,value] of Object.entries(m))if(!['id','namespace','elements'].includes(key))loss(`/modules/${i}/`+pointer(key),value,'Module metadata is not projected');
  m.elements.forEach((e,j)=>{if(j!==ei)loss(`/modules/${i}/elements/${j}`,e,'Other element is outside selected Field projection');});
 });
 for(const [key,value] of Object.entries(element))if(!['id','kind','name','scalarType'].includes(key)&&!(key==='extensions'&&value&&typeof value==='object'&&Object.keys(value).length===0))loss(path+'/'+pointer(key),value,'Field metadata is retained but not projected');
 const target=importParquetSchema(parquetFieldFile(request.recordName,request.fieldName,request.nativeType,request.repetition),{id:request.id});
 if(element.scalarType!==undefined&&element.scalarType!==getParquetFieldMetadata(target).fields[0]!.element.scalarType)loss(path+'/scalarType',element.scalarType,'Explicit native type does not establish the stated scalar family','not-expressible');
 if(result.residuals.length)result.mapping.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':'unknown';
 // A record/group never becomes a field even under report policy.
 if(author.provenance.kind!=='field'||request.mode==='strict'&&result.residuals.length)result.status='blocked';else result.target=target;
 result.diagnostics=result.residuals.map(r=>({code:'FIELD_MEANING_NOT_PROJECTED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const output=copyJson(result);if(!check(output))throw new UmfError('FIELD_PARQUET_RESULT',JSON.stringify(check.errors));return output as unknown as FieldParquetProjection & {diagnostics:Diagnostic[]};
}
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export function recoverFieldFromParquet(input:FieldParquetProjection,nativeBytes:Uint8Array):Document {
 const receipt=copyJson(input) as unknown as FieldParquetProjection;
 if(!check(receipt)||receipt.status!=='projected'||!receipt.target)throw new UmfError('FIELD_PARQUET_RECEIPT','Expected projected receipt');
 const expected:FieldParquetProjection=projectFieldToParquet(receipt.author,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('FIELD_PARQUET_RECEIPT','Receipt does not match retained source and binding');
 const expectedBytes=exportParquetCapture(receipt.target);
 if(!(nativeBytes instanceof Uint8Array)||nativeBytes.length!==expectedBytes.length||nativeBytes.some((b,i)=>b!==expectedBytes[i]))throw new UmfError('FIELD_PARQUET_STALE','Native target changed; retained report cannot assert recovery');
 return copyJson(receipt.source) as unknown as Document;
}
