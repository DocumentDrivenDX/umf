import {avroCarriers} from './avro-carriers';
import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Json,type Diagnostic} from '../model/types';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from '../model/field-kind';
import {importAvroSchema,exportAvroSchema,getAvroFieldMetadata} from '../adapters/avro';
import {type FieldAvroRequest,type FieldAvroProjection} from './field-avro-projection';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import kinds from '../../spec/core/kind-operation.schema.json';import schema from '../../spec/core/record-avro-projection.schema.json';
export {default as recordAvroProjectionSchema} from '../../spec/core/record-avro-projection.schema.json';
export interface RecordAvroRequest {id:string;recordName:string;namespace:string;mode:'strict'|'report';fields:{author:CoreKindDeclaration;fieldName:string;nativeType:FieldAvroRequest['nativeType']}[]}
const binding={id:'umf.core.record.avro',version:'1.0.0',nativeVersion:'1.12.0',subset:'Authored flat record with explicit primitive/logical field carriers; no presence, execution or value-domain equivalence'} as const;
export interface RecordAvroProjection {operation:'project-record-avro';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreKindDeclaration;request:RecordAvroRequest;binding:typeof binding;target?:Document;mappings:{origin:'authored';kind:'record'|'field';idealPath:string;nativePath:string;outcome:'exact'|'unknown'|'not-expressible'}[];residuals:FieldAvroProjection['residuals'];diagnostics:Diagnostic[]}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(kinds);const check=validator.compile(schema),checkRequest=validator.compile(schema.properties.request);
export function projectRecordToAvro(input:CoreKindDeclaration,options:RecordAvroRequest):RecordAvroProjection {
 const copied=copyJson(input) as unknown as CoreKindDeclaration,author=verifyCoreKindDeclaration(copied,copied.target),source=copyJson(author.target) as unknown as Document,request=copyJson(options) as unknown as RecordAvroRequest;
 if(!checkRequest(request))throw new UmfError('RECORD_AVRO_REQUEST',JSON.stringify(checkRequest.errors));
 const locate=(id:{module:string;element:string})=>{const mi=source.modules.findIndex(m=>m.id===id.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===id.element)??-1;if(mi<0||ei<0)throw new UmfError('RECORD_AVRO_IDENTITY','Missing declared element');return {element:source.modules[mi]!.elements[ei]!,path:`/modules/${mi}/elements/${ei}`,mi};};
 const selected=locate(author.identity),record=selected.element,identity=(v:{module:string;element:string})=>JSON.stringify([v.module,v.element]);
 const result:RecordAvroProjection={operation:'project-record-avro',version:'1.0.0',status:'projected',source,author,request,binding,mappings:[],residuals:[],diagnostics:[]};let hard=false;
 const loss=(path:string,value:unknown,reason:string,unexpressible=false,fatal=false)=>{hard ||= fatal;result.residuals.push({path,value:copyJson(value),reason,outcome:unexpressible?'not-expressible':'unknown',recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'});result.diagnostics.push({code:fatal?'RECORD_BINDING_CONFLICT':'RECORD_MEANING_NOT_PROJECTED',path,message:reason,severity:fatal||request.mode==='strict'?'error':'warning'});};
 if(author.provenance.kind!=='record')loss(selected.path+'/kind',record.kind,'Only an authored record can define the native record',true,true);
 if(record.name!==undefined&&record.name!==request.recordName)loss(selected.path+'/name',record.name,'Native record name differs from ideal name',true);
 const members=new Map<string,NonNullable<typeof record.references>[number]>();
 for(const [index,ref] of (record.references??[]).entries()){
  if(ref.role!=='member'){loss(selected.path+'/references/'+index,ref,'Non-member relationship is retained but not projected');continue;}
  if(members.has(identity(ref)))loss(selected.path+'/references/'+index,ref,'Duplicate record member',true,true);else members.set(identity(ref),ref);
  for(const [key,value] of Object.entries(ref))if(!['role','module','element'].includes(key))loss(selected.path+'/references/'+index+'/'+pointer(key),value,'Reference metadata is not projected');
 }
 const bindings=new Map<string,RecordAvroRequest['fields'][number]>(),names=new Set<string>();
 for(const field of request.fields){
  verifyCoreKindDeclaration(field.author,source);
  const key=identity(field.author.identity);
  if(bindings.has(key)||!members.has(key))loss(field.author.provenance.idealPath,field,'Duplicate or non-member native binding',true,true);else bindings.set(key,field);
  if(names.has(field.fieldName))loss(field.author.provenance.idealPath,field.fieldName,'Native field names collide',true,true);names.add(field.fieldName);
 }
 const columns:Record<string,unknown>[]=[],included=new Set([selected.path]),locations:{path:string;scalarType?:string}[]=[];
 for(const [key,ref] of members){
  const found=locate(ref),field=bindings.get(key);included.add(found.path);
  if(!field){loss(found.path,found.element,'Missing explicit member binding',true,true);continue;}
  if(field.author.provenance.kind!=='field')loss(found.path+'/kind',found.element.kind,'Record member is not an authored field',true,true);
  if(found.element.name!==undefined&&found.element.name!==field.fieldName)loss(found.path+'/name',found.element.name,'Native field name differs from ideal name',true);
  result.mappings.push({origin:'authored',kind:'field',idealPath:found.path+'/kind',nativePath:'/fields/'+columns.length,outcome:'exact'});
  columns.push({name:field.fieldName,type:avroCarriers[field.nativeType],...(found.element.description!==undefined?{doc:found.element.description}:{})});locations.push({path:found.path,...(found.element.scalarType!==undefined?{scalarType:found.element.scalarType}:{})});
 }
 for(const [key,value] of Object.entries(source))if(!['umf','id','modules','vocabularies'].includes(key))loss('/'+pointer(key),value,'Document metadata is not projected');
 if(Object.keys(source.vocabularies).length)loss('/vocabularies',source.vocabularies,'Native vocabulary semantics are not projected');
 source.modules.forEach((module,mi)=>{
  const root='/modules/'+mi;
  if(!module.elements.some((_,ei)=>included.has(root+'/elements/'+ei))){loss(root,module,'Module lies outside projected record');return;}
  for(const [key,value] of Object.entries(module))if(!['id','namespace','elements'].includes(key))loss(root+'/'+pointer(key),value,'Module metadata is not projected');
  module.elements.forEach((element,ei)=>{
   const path=root+'/elements/'+ei;if(!included.has(path)){loss(path,element,'Element lies outside projected record');return;}
   const known=path===selected.path?['id','kind','name','description','references']:['id','kind','name','description','scalarType'];
   for(const [key,value] of Object.entries(element))if(!known.includes(key)&&!(key==='extensions'&&value&&typeof value==='object'&&Object.keys(value).length===0))loss(path+'/'+pointer(key),value,'Element metadata is not projected');
  });
 });
 let target:Document|undefined;
 if(!hard){
  target=importAvroSchema(JSON.stringify({type:'record',name:request.recordName,namespace:request.namespace,...(record.description!==undefined?{doc:record.description}:{}),fields:columns})+'\n',{id:request.id});
  locations.forEach((location,index)=>{if(location.scalarType!==undefined&&location.scalarType!==getAvroFieldMetadata(target!)[index]!.element.scalarType)loss(location.path+'/scalarType',location.scalarType,'Native type does not establish ideal scalar family',true);});
 }
 for(const mapping of result.mappings){const prefix=mapping.idealPath.slice(0,-5);if(result.residuals.some(r=>r.path.startsWith(prefix+'/')))mapping.outcome='unknown';}
 result.mappings.unshift({origin:'authored',kind:'record',idealPath:selected.path+'/kind',nativePath:'',outcome:result.residuals.length?'unknown':'exact'});
 if(hard||request.mode==='strict'&&result.residuals.length)result.status='blocked';else result.target=target!;
 const output=copyJson(result);if(!check(output))throw new UmfError('RECORD_AVRO_RESULT',JSON.stringify(check.errors));return output as unknown as RecordAvroProjection;
}
export function recoverRecordFromAvro(input:RecordAvroProjection,nativeText:string):Document {
 const receipt=copyJson(input) as unknown as RecordAvroProjection;
 if(!check(receipt)||receipt.status!=='projected'||!receipt.target)throw new UmfError('RECORD_AVRO_RECEIPT','Expected complete projection receipt');
 const expected=projectRecordToAvro(receipt.author,receipt.request);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('RECORD_AVRO_RECEIPT','Receipt differs from recomputed projection');
 if(typeof nativeText!=='string'||exportAvroSchema(receipt.target)!==nativeText)throw new UmfError('RECORD_AVRO_STALE','Native target changed');
 return copyJson(receipt.source) as unknown as Document;
}
