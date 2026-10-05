import schema from '../../spec/core/semantic-types-document.schema.json';
import referenceSchema from '../../spec/core/semantic-type-reference.schema.json';
import {createValidator} from './schema';
import {validateSchemaPropertiesDocument} from './schema-properties';
import {Registry} from '../registry/registry';
import {copyJson} from '../model/json';
import {UmfError,pointer,type Document,type Diagnostic,type Validation} from '../model/types';
const validator=createValidator();validator.addSchema(referenceSchema);
export const checkSemanticTypesDocument=validator.compile(schema);
export const checkSemanticTypeReferences=validator.compile({type:'array',minItems:1,items:{$ref:referenceSchema.$id}});
/** Check pointing structure while leaving exact external meanings unresolved. */
export function validateSemanticTypesDocument(input:unknown,registry=new Registry()):Validation {
 const diagnostics:Diagnostic[]=[];
 const add=(code:string,path:string,message:string,severity:'error'|'warning'='warning')=>diagnostics.push({code,path,message,severity});
 let source:Document;
 try{source=copyJson(input) as unknown as Document;}catch(error){if(!(error instanceof UmfError))throw error;add(error.code,error.path,error.message,'error');return {valid:false,complete:false,diagnostics};}
 if(!checkSemanticTypesDocument(source)){
  for(const e of checkSemanticTypesDocument.errors??[])add('SEMANTIC_TYPE_STRUCTURE',e.instancePath,e.message??'Invalid core semantic type structure','error');
  return {valid:false,complete:false,diagnostics};
 }
 const base=copyJson(source) as unknown as Document;base.umf='0.8.0';
 for(const m of base.modules)for(const e of m.elements)delete e.semanticTypes;
 // Inherited validators use private views. Explicit semantic callbacks must see
 // the actual source revision and every annotation, never the stripped view.
 const contextualRegistry=new Registry();
 for(const [id,declaration] of Object.entries(source.vocabularies)){
  const entry=registry.get(id,declaration.version);
  if(entry)contextualRegistry.register(entry.manifest,entry.semantics?(payload,context)=>entry.semantics!(payload,{...context,document:copyJson(source) as unknown as Document}):undefined);
 }
 diagnostics.push(...validateSchemaPropertiesDocument(base,contextualRegistry).diagnostics);
 add('EXPERIMENTAL_CORE_SEMANTIC_TYPES','/umf','Experimental semantic references; publisher-owned meanings and native enforcement are not inferred');
 source.modules.forEach((m,mi)=>m.elements.forEach((e,ei)=>{
  if(!e.semanticTypes)return;
  const path=`/modules/${mi}/elements/${ei}/semanticTypes`;
  add('SEMANTIC_TYPE_EXTERNAL',path,'Exact external semantic definitions and value validators are resolved separately');
  e.semanticTypes.forEach((ref,i)=>{for(const key of Object.keys(ref))if(!['vocabulary','version','term'].includes(key))add('UNKNOWN_SEMANTIC_TYPE_QUALIFIER',path+`/${i}/`+pointer(key),'Qualifier retained without interpretation');});
 }));
 return {valid:!diagnostics.some(d=>d.severity==='error'),complete:diagnostics.length===0,diagnostics};
}
