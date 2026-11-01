// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../model/types';
import type {DddDocumentBindings,DddDocumentProjection} from './ddd-json-schema';
import type {DddDefinition,DddReference} from '../extensions/ddd';
import {copyJson} from '../model/json';
import manifest from '../../spec/extensions/ddd/package.json';
import type {Diagnostic,Document,ExtensionPackage,Json,Scope,Validation} from '../model/types';

type NativeErrorGuard=(error:unknown)=>boolean;
export interface DddJsonSchemaNativeFamily {
 ['ddd-json-schema-projection']:{
  projectDddToJsonSchema(fields:{document:Document;bindings:DddDocumentBindings}):unknown;
  dddFieldBinding(fields:{module:string;element:string;field:string}):unknown;
  inspectDdd(fields:{document:Document}):unknown;
  validateDddPayload(fields:{document:Document;payload:Json;path:string;scope:Scope}):unknown;
  getDddDefinition(fields:{document:Document;module:string;element:string}):unknown;
  editDddDefinition(fields:{document:Document;module:string;element:string;replacement:Json}):unknown;
 };
}
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createDddJsonSchemaRustDefault(engine:DddJsonSchemaNativeFamily,isNativeError:NativeErrorGuard=()=>false){
 function call<T>(operation:()=>unknown):T{try{return operation() as T;}catch(error){if(!isNativeError(error))throw error;const native=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof native.code!=='string'||CONTROL_CODES.has(native.code)||(!native.code.startsWith('DDD_')&&!['REQUEST','JSON_SCHEMA_SYNTAX','JSON_SCHEMA_POINTER','UNSAFE_EDIT','MISSING_ELEMENT','INVALID_EDIT'].includes(native.code)))throw error;throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');}}
 const dddPackage=manifest as unknown as ExtensionPackage;
 const validatePayload=(payload:Json,context:{document:Document;path:string;scope:Scope}):Diagnostic[]=>call(()=>engine['ddd-json-schema-projection'].validateDddPayload({document:context.document,payload,path:context.path,scope:context.scope})) as Diagnostic[];
 const registerDdd=<T extends {register(manifest:ExtensionPackage,semantics:(payload:Json,context:{document:Document;path:string;scope:Scope})=>Diagnostic[]):T}>(registry:T):T=>registry.register(dddPackage,validatePayload);
 function inspect(document:Document):Validation{return call(()=>engine['ddd-json-schema-projection'].inspectDdd({document})) as Validation;}
 function requireValid(document:Document,message='Invalid DDD model'):Validation{const result=inspect(document);if(!result.valid){const profile=result.diagnostics.find(diagnostic=>diagnostic.code==='DDD_PROFILE');if(profile)throw new UmfError('DDD_PROFILE',profile.message,profile.path);throw new UmfError('DDD_DOCUMENT',message==='Invalid DDD model'?JSON.stringify(result.diagnostics):message);}return result;}
 function getDefinition(document:Document,moduleId:string,elementId:string):DddDefinition{return call(()=>engine['ddd-json-schema-projection'].getDddDefinition({document,module:moduleId,element:elementId})) as DddDefinition;}
 function editDefinition(document:Document,moduleId:string,elementId:string,update:(definition:DddDefinition)=>DddDefinition):Document{const definition=getDefinition(document,moduleId,elementId);const replacement=copyJson(update(definition)) as unknown as Json;return call(()=>engine['ddd-json-schema-projection'].editDddDefinition({document,module:moduleId,element:elementId,replacement})) as Document;}
 return Object.freeze({
  projectDddToJsonSchema(source:Document,bindings:DddDocumentBindings):DddDocumentProjection{return call(()=>engine['ddd-json-schema-projection'].projectDddToJsonSchema({document:source,bindings}));},
  dddFieldBinding(ref:DddReference,field:string):string{return call(()=>engine['ddd-json-schema-projection'].dddFieldBinding({module:ref.module,element:ref.element,field})) as string;},
  inspectDdd:inspect,
  readDddDocument(source:string,format:'json'|'yaml',readDocument:(source:string,format:'json'|'yaml')=>Document):Document{const document=readDocument(source,format);requireValid(document);return document;},
  writeDddDocument(document:Document,format:'json'|'yaml',writeDocument:(document:Document,format:'json'|'yaml')=>string):string{requireValid(document);return writeDocument(document,format);},
  getDddDefinition:getDefinition,
  editDddDefinition:editDefinition,
  registerDdd,
  dddRegistry<T extends {register(manifest:ExtensionPackage,semantics:(payload:Json,context:{document:Document;path:string;scope:Scope})=>Diagnostic[]):T}>(createRegistry:()=>T):T{return registerDdd(createRegistry());},
  validateDddPayload:validatePayload,
 });
}
