// SPDX-License-Identifier: MIT OR Apache-2.0
/** Small AJV-compatible facade backed by UMF's prepared Rust schema runtime. */
import {semanticTypeReferenceSchema} from '../generated/core-model';
export interface ValidatorError {instancePath:string;schemaPath:string;keyword:string;params:unknown;message:string}
export interface CompiledValidator<T=unknown> { (data:unknown):data is T; errors:ValidatorError[]|null }
export interface Validator {addSchema(schema:unknown|unknown[],key?:string):this;compile<T=unknown>(schema:unknown):CompiledValidator<T>;getSchema<T=unknown>(id:string):CompiledValidator<T>|undefined}
export interface ValidatorRuntime {compileValidator(key:string,schema:unknown,resources:{uri:string;schema:unknown}[],strict:boolean):unknown;validateValidator(key:string,data:unknown):ValidatorError[];copyValidatorSchema(value:unknown):unknown;validatorSchemasEqual(left:unknown,right:unknown):boolean;registerValidatorSchema(identities:string[],schema:unknown):void}
function schemaId(schema:unknown):string|undefined {if(schema&&typeof schema==='object'&&!Array.isArray(schema)&&typeof (schema as {$id?:unknown}).$id==='string')return (schema as {$id:string}).$id;return undefined;}

/** Create a callable validator. Supported operations are addSchema, compile, getSchema and errors. */
export function createValidator(runtime:ValidatorRuntime,strict=true):Validator {
 const owned=(value:unknown)=>runtime.copyValidatorSchema(value),semantic=owned(semanticTypeReferenceSchema),semanticId=schemaId(semantic)!;
 const resources=new Map<string,{schema:unknown}>([[semanticId,{schema:semantic}]]),compiled=new Map<string,CompiledValidator>();let sequence=0;
 const validator:Validator={
  addSchema(schema,key){
   if(Array.isArray(schema)){for(const item of schema)validator.addSchema(item);return validator;}
   const ownedSchema=owned(schema),id=key??schemaId(ownedSchema)??'';
   const ids=new Set([id,...(schemaId(ownedSchema)?[schemaId(ownedSchema)!]:[])]);
   runtime.registerValidatorSchema([...ids],ownedSchema);
   for(const resourceId of ids){const existing=resources.get(resourceId);if(existing&&!runtime.validatorSchemasEqual(existing.schema,ownedSchema))throw new Error('Conflicting schema identity: '+resourceId);}
   for(const resourceId of ids)resources.set(resourceId,{schema:ownedSchema});
   return validator;
  },
  compile<T=unknown>(schema:unknown):CompiledValidator<T>{
   const ownedSchema=owned(schema),id=schemaId(ownedSchema);if(id&&resources.has(id)){const existing=resources.get(id)!;if(!runtime.validatorSchemasEqual(existing.schema,ownedSchema))throw new Error('Conflicting schema identity: '+id);const cached=compiled.get(id);if(cached)return cached as CompiledValidator<T>;}
   const key='loader-validator:'+String(++sequence),all=[...resources].filter(([uri])=>uri!==id&&uri!=='').map(([uri,entry])=>({uri,schema:entry.schema}));
   runtime.compileValidator(key,ownedSchema,all,strict);
   const check=((data:unknown)=>{const errors=runtime.validateValidator(key,data);check.errors=errors.length?errors:null;return errors.length===0;}) as CompiledValidator<T>;
   check.errors=null;if(id){compiled.set(id,check);resources.set(id,{schema:ownedSchema});}return check;
  },
  getSchema<T=unknown>(id:string):CompiledValidator<T>|undefined{const existing=compiled.get(id);if(existing)return existing as CompiledValidator<T>;const resource=resources.get(id);if(!resource)return undefined;const check=validator.compile<T>(resource.schema);compiled.set(id,check);return check;},
 };
 return validator;
}
