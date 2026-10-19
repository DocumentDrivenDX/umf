// SPDX-License-Identifier: MIT OR Apache-2.0
import * as unicodeRuntime from 'ajv/dist/runtime/ucs2length';
import Ajv from 'ajv/dist/2020';
import standalone from 'ajv/dist/standalone';
import {_} from 'ajv/dist/compile/codegen';
import {_Code} from 'ajv/dist/compile/codegen/code';
import {canonicalJson} from '../../src/validation/json-equality';
/** Serialize the same generic equality implementation used by the interpreter. */
export function structuralSource(schemas:any[]):string {
 const source=canonicalJson.toString(),helper=(c:any)=>c.gen.scopeValue('func',{ref:canonicalJson,code:new _Code('('+source+')')});
 const ajv=new Ajv({allErrors:true,strict:true,allowUnionTypes:true,ownProperties:true,validateFormats:false,code:{source:true,esm:true}});
 for(const key of ['const','enum','uniqueItems'])ajv.removeKeyword(key);
 ajv.addKeyword({keyword:'const',code(c:any){const eq=helper(c);c.fail(_`${eq}(${c.data}) !== ${eq}(${c.schemaCode})`);}});
 ajv.addKeyword({keyword:'enum',schemaType:'array',code(c:any){const eq=helper(c);c.fail(_`!${c.schemaCode}.some(value => ${eq}(value) === ${eq}(${c.data}))`);}});
 ajv.addKeyword({keyword:'uniqueItems',type:'array',schemaType:'boolean',code(c:any){const eq=helper(c);if(c.schema)c.fail(_`new Set(${c.data}.map(${eq})).size !== ${c.data}.length`);}});
 for(const schema of schemas)ajv.addSchema(schema);
 ajv.addSchema({$id:'urn:umf:generated:literal',$defs:schemas[0].$defs,$ref:'#/$defs/literal'});
 ajv.addSchema({$id:'urn:umf:generated:semantic-references',type:'array',minItems:1,items:{$ref:schemas[1].$id}});
 const emitted=standalone(ajv,{checkCore:schemas[0].$id,checkSemanticTypeReference:schemas[1].$id,checkPackage:schemas[2].$id,checkCoreLiteral:'urn:umf:generated:literal',checkSemanticTypeReferences:'urn:umf:generated:semantic-references'}).replace(/const (\w+) = require\("ajv\/dist\/runtime\/ucs2length"\)\.default;/g,(_,name)=>'const '+name+' = '+(((unicodeRuntime.default as any).default??unicodeRuntime.default) as Function).toString()+';').replace(/export const (\w+) = /g,'export const $1: ValidateFunction = ');
 return '// SPDX-License-Identifier: MIT OR Apache-2.0\n// Generated from the authored UMF metamodel. Do not edit.\n// @ts-nocheck\nimport type {ValidateFunction} from \"ajv\";\n'+emitted;
}
