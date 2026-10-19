// SPDX-License-Identifier: MIT OR Apache-2.0
import {semanticTypeReferenceSchema} from '../generated/core-model';
import Ajv2020 from 'ajv/dist/2020';
import {canonicalJson} from './json-equality';
import {snapshotSchema} from './internal-schema';
const semanticReference=snapshotSchema(semanticTypeReferenceSchema);
export {checkCore,checkPackage} from '../generated/core-validators';
export function installJsonEquality(validator:Pick<Ajv2020,'removeKeyword'|'addKeyword'>){
 validator.removeKeyword('uniqueItems').addKeyword({keyword:'uniqueItems',type:'array',schemaType:'boolean',errors:false,validate:(unique:boolean,data:unknown[])=>!unique||new Set(data.map(canonicalJson)).size===data.length});
 validator.removeKeyword('const').addKeyword({keyword:'const',errors:false,validate:(expected:unknown,data:unknown)=>canonicalJson(expected)===canonicalJson(data)});
 validator.removeKeyword('enum').addKeyword({keyword:'enum',schemaType:'array',errors:false,validate:(expected:unknown[],data:unknown)=>expected.some(v=>canonicalJson(v)===canonicalJson(data))});
}
export function createValidator(strict=true){const validator=new Ajv2020({allErrors:true,strict,allowUnionTypes:true,ownProperties:true,validateFormats:false});installJsonEquality(validator);
 const original=validator.addSchema.bind(validator),compile=validator.compile.bind(validator),getSchema=validator.getSchema.bind(validator),resources=new Map<string,string>(),ownedResources=new Map<string,any>();
 validator.addSchema=((schema:any,key?:string)=>{
  if(Array.isArray(schema)){for(const resource of schema)validator.addSchema(resource);return validator;}
  const primary=key??schema?.$id??'',ids=[...new Set([primary,...(typeof schema?.$id==='string'?[schema.$id]:[])])],canonical=canonicalJson(schema),alreadyRegistered=resources.has(primary);
  let owned:any;for(const id of ids)if(resources.has(id)){if(resources.get(id)!==canonical)throw Error('Conflicting schema identity: '+id);owned??=ownedResources.get(id);}
  owned??=snapshotSchema(schema);for(const id of ids){resources.set(id,canonical);ownedResources.set(id,owned);}
  // The resource ID already resolves through AJV refs even when first registered
  // under a caller alias. New aliases reuse the exact private snapshot identity.
  return alreadyRegistered?validator:original(owned,key);
 }) as typeof validator.addSchema;
 let registeredReference=false;
 const reference=()=>{if(!registeredReference){validator.addSchema(semanticReference);registeredReference=true;}};
 validator.getSchema=((id:string)=>{if(!id.startsWith('https://json-schema.org/'))reference();return getSchema(id);}) as typeof validator.getSchema;
 validator.compile=((schema:any)=>{if(typeof schema==='boolean'){const fixed=((_data:unknown)=>{fixed.errors=schema?null:[{instancePath:'',schemaPath:'#/false schema',keyword:'false schema',params:{},message:'boolean schema is false'}];return schema;}) as any;fixed.errors=null;return fixed;}reference();const id=schema?.$id;if(!id)return compile(snapshotSchema(schema));validator.addSchema(schema);return validator.getSchema(id)!;}) as typeof validator.compile;
 return validator;}
