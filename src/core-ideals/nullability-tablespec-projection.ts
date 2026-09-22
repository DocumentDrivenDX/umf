import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreNullabilityDeclaration,type CoreNullabilityDeclaration} from '../model/nullability';
import {importTableSpec,exportTableSpec} from '../adapters/tablespec';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';
import fields from '../../spec/core/field-document.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
import authorSchema from '../../spec/core/nullability-operation.schema.json';
import schema from '../../spec/core/nullability-tablespec-projection.schema.json';
export {default as nullabilityTableSpecProjectionSchema} from '../../spec/core/nullability-tablespec-projection.schema.json';
export interface NullabilityTableSpecRequest {id:string;tableName:string;columnName:string;nativeType:'BOOLEAN'|'INTEGER'|'DECIMAL'|'FLOAT'|'TEXT'|'VARCHAR'|'CHAR'|'DATE'|'DATETIME'|'TIMESTAMP';mode:'strict'|'report';profile:'runtime-model'|'checked-schema'|'unresolved';context:string|null;carrier:'null-value'|'unresolved'}
const binding=schema.properties.binding.const;
export interface NullabilityTableSpecProjection {
 operation:'project-nullability-tablespec';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreNullabilityDeclaration;request:NullabilityTableSpecRequest;target?:Document;binding:typeof binding;diagnostics?:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativePath:string|null;nullability:'required'|'absent-allowed'|'unspecified';encoding:'boolean'|'context-map'|'omitted';context:string|null;carrier:NullabilityTableSpecRequest['carrier'];profile:NullabilityTableSpecRequest['profile'];outcome:'exact'|'unknown'|'not-expressible'};
 profileNotes:{profile:'checked-schema';code:'SCALAR_BOOLEAN_REJECTED';message:string}[];
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(availability);validator.addSchema(authorSchema);const check=validator.compile(schema);
const checkRequest=validator.compile({...schema.properties.request});
export function projectNullabilityToTableSpec(input:CoreNullabilityDeclaration,options:NullabilityTableSpecRequest):NullabilityTableSpecProjection & {diagnostics:Diagnostic[]} {
 const copied=copyJson(input) as unknown as CoreNullabilityDeclaration;
 const author=verifyCoreNullabilityDeclaration(copied,copied.target),source=copyJson(author.target) as unknown as Document,request=copyJson(options) as unknown as NullabilityTableSpecRequest;
 if(!checkRequest(request))throw new UmfError('NULLABILITY_TABLESPEC_REQUEST',JSON.stringify(checkRequest.errors));
 const mi=source.modules.findIndex(m=>m.id===author.identity.module),module=source.modules[mi]!,ei=module.elements.findIndex(e=>e.id===author.identity.element),element=module.elements[ei]!,path=`/modules/${mi}/elements/${ei}`;
 const result:NullabilityTableSpecProjection={operation:'project-nullability-tablespec',version:'1.0.0',status:'projected',source,author,request,binding,mapping:{origin:'authored',idealPath:path+'/nullability',nativePath:null,nullability:author.provenance.nullability,encoding:'omitted',context:request.context,carrier:request.carrier,profile:request.profile,outcome:'exact'},profileNotes:[],residuals:[],diagnostics:[]};
 const loss=(path:string,value:unknown,reason:string,outcome:'unknown'|'not-expressible'='unknown')=>result.residuals.push({path,value:copyJson(value),reason,outcome,recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'});
 if(element.name!==undefined&&element.name!==request.columnName)loss(path+'/name',element.name,'Explicit native column name differs from ideal name','not-expressible');
 // Closed projection scope: every source property outside the implemented mapping is disclosed.
 for(const [key,value] of Object.entries(source))if(!['umf','id','modules','vocabularies'].includes(key))loss('/'+pointer(key),value,'Document metadata is retained but not projected');
 if(Object.keys(source.vocabularies).length)loss('/vocabularies',source.vocabularies,'Native vocabulary semantics are not projected');
 source.modules.forEach((m,i)=>{
  if(i!==mi){loss('/modules/'+i,m,'Other module is outside selected Field projection');return;}
  if(m.namespace)loss(`/modules/${i}/namespace`,m.namespace,'This TableSpec binding has no namespace representation','not-expressible');
  for(const [key,value] of Object.entries(m))if(!['id','namespace','elements'].includes(key))loss(`/modules/${i}/`+pointer(key),value,'Module metadata is not projected');
  m.elements.forEach((e,j)=>{if(j!==ei)loss(`/modules/${i}/elements/${j}`,e,'Other element is outside selected Field projection');});
 });
 for(const [key,value] of Object.entries(element))if(!['id','kind','name','description','scalarType','nullability'].includes(key)&&!(key==='extensions'&&value&&typeof value==='object'&&Object.keys(value).length===0))loss(path+'/'+pointer(key),value,'Field metadata is retained but not projected');
 const nullability=author.provenance.nullability;let nullable:boolean|Record<string,boolean>|undefined;
 if(request.profile==='unresolved')loss(path+'/nullability',nullability,'No target native profile selected; availability is retained only in the receipt');
 else if(nullability!=='unspecified'){
  if(request.carrier!=='null-value')loss(path+'/nullability',nullability,'No explicit absence carrier selected; omission and present null are not equated');
  else if(request.context!==null){nullable={[request.context]:nullability==='absent-allowed'};result.mapping.encoding='context-map';result.mapping.nativePath='/columns/0/nullable/'+pointer(request.context);}
  else if(request.profile==='runtime-model'){
   nullable=nullability==='absent-allowed';result.mapping.encoding='boolean';result.mapping.nativePath='/columns/0/nullable';
   result.profileNotes.push({profile:'checked-schema',code:'SCALAR_BOOLEAN_REJECTED',message:'This scalar boolean is accepted by the selected runtime profile but rejected by the pinned checked-in schema; that other profile is not claimed'});
  }else loss(path+'/nullability',nullability,'Checked-schema profile needs an explicit context to encode the availability assertion','not-expressible');
 }
 const text=JSON.stringify({version:'1.0',table_name:request.tableName,columns:[{name:request.columnName,data_type:request.nativeType,...(element.description!==undefined?{description:element.description}:{}),...(nullable!==undefined?{nullable}:{})}]})+'\n';
 const target=importTableSpec(text,{id:request.id,format:'json'});
 if(element.scalarType!==undefined&&element.scalarType!==target.modules[0]!.elements[0]!.scalarType)loss(path+'/scalarType',element.scalarType,'Explicit native type does not establish the stated scalar family','not-expressible');
 if(result.residuals.length)result.mapping.outcome=result.residuals.some(r=>r.outcome==='not-expressible')?'not-expressible':'unknown';
 if(request.mode==='strict'&&result.residuals.length)result.status='blocked';else result.target=target;
 result.diagnostics=result.residuals.map(r=>({code:'NULLABILITY_MEANING_NOT_PROJECTED',path:r.path,message:r.reason,severity:result.status==='blocked'?'error':'warning'}));
 const output=copyJson(result);if(!check(output))throw new UmfError('NULLABILITY_TABLESPEC_RESULT',JSON.stringify(check.errors));return output as unknown as NullabilityTableSpecProjection & {diagnostics:Diagnostic[]};
}
/** Recover retained author meaning only when the receipt and supplied native target still agree. */
export function recoverNullabilityFromTableSpec(input:NullabilityTableSpecProjection,nativeText:string):Document {
 const receipt=copyJson(input) as unknown as NullabilityTableSpecProjection;
 if(!check(receipt)||receipt.status!=='projected'||!receipt.target)throw new UmfError('NULLABILITY_TABLESPEC_RECEIPT','Expected projected receipt');
 const expected:NullabilityTableSpecProjection=projectNullabilityToTableSpec(receipt.author,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(expected))!==canonical(copyJson(receipt)))throw new UmfError('NULLABILITY_TABLESPEC_RECEIPT','Receipt does not match retained source and binding');
 if(typeof nativeText!=='string'||nativeText!==exportTableSpec(receipt.target))throw new UmfError('NULLABILITY_TABLESPEC_STALE','Native target changed; retained report cannot assert recovery');
 return copyJson(receipt.source) as unknown as Document;
}
