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
  projectDddEntitiesToGraphql(fields:{document:Document;policy:import('./ddd-graphql/entities').DddGraphqlEntityPolicy;lossPolicy:'strict'|'report'}):unknown;
  projectDddToGraphql(fields:{document:Document;policy:import('./ddd-graphql').DddGraphqlPolicy;lossPolicy:'strict'|'report'}):unknown;
  verifyDddGraphqlProjection(fields:{receipt:import('./ddd-graphql').DddGraphqlProjection|import('./ddd-graphql/entities').DddGraphqlEntityProjection;currentTarget?:Document}):unknown;
  recoverDddFromGraphql(fields:{receipt:import('./ddd-graphql').DddGraphqlProjection;currentTarget:Document}):unknown;
  recoverDddGraphqlNative(fields:{receipt:import('./ddd-graphql').DddGraphqlProjection;currentTarget:Document}):unknown;
  validateSqlServerRelationshipLayout(fields:{document:Document;binding:Document;policy:import('./binding-sqlserver/relationship-layout').SqlServerRelationshipLayoutPolicy;lossPolicy:'strict'|'report'}):unknown;
  validatePostgresqlRelationshipLayout(fields:{document:Document;binding:Document;policy:import('./ddd-postgresql/relationship-layout').PostgresqlRelationshipLayoutPolicy;lossPolicy:'strict'|'report'}):unknown;
  prepareDddPostgresqlProjection(fields:{document:Document;binding:Document;policy:import('./ddd-postgresql/index').DddPostgresqlPolicy}):unknown;
  completeDddPostgresqlProjection(fields:{document:Document;binding:Document;policy:import('./ddd-postgresql/index').DddPostgresqlPolicy;candidateSource:string;candidateArchive:Document;nativeSource:string;targetArchive:Document}):unknown;
  blockDddPostgresqlProjection(fields:{document:Document;binding:Document;policy:import('./ddd-postgresql/index').DddPostgresqlPolicy;path:string;message:string}):unknown;
  verifyDddPostgresqlProjection(fields:{receipt:import('./ddd-postgresql/index').DddPostgresqlProjection;currentTarget:Document;candidateSource:string;candidateArchive:Document}):unknown;
  recoverDddPostgresqlIdeal(fields:{receipt:import('./ddd-postgresql/index').DddPostgresqlProjection;currentTarget:Document;candidateSource:string;candidateArchive:Document}):unknown;
  recoverDddPostgresqlNative(fields:{receipt:import('./ddd-postgresql/index').DddPostgresqlProjection;currentTarget:Document;candidateSource:string;candidateArchive:Document}):unknown;
 };
}
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
export function createDddJsonSchemaRustDefault(engine:DddJsonSchemaNativeFamily,isNativeError:NativeErrorGuard=()=>false){
 function call<T>(operation:()=>unknown):T{try{return operation() as T;}catch(error){if(!isNativeError(error))throw error;const native=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof native.code!=='string'||CONTROL_CODES.has(native.code)||(!native.code.startsWith('DDD_')&&!native.code.startsWith('SQLSERVER_LAYOUT_')&&!native.code.startsWith('POSTGRESQL_LAYOUT_')&&!['REQUEST','JSON_SCHEMA_SYNTAX','JSON_SCHEMA_POINTER','UNSAFE_EDIT','MISSING_ELEMENT','INVALID_EDIT'].includes(native.code)))throw error;throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');}}
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
  projectDddEntitiesToGraphql(logical:Document,policy:import('./ddd-graphql/entities').DddGraphqlEntityPolicy,lossPolicy:'strict'|'report'):import('./ddd-graphql/entities').DddGraphqlEntityProjection{return call(()=>engine['ddd-json-schema-projection'].projectDddEntitiesToGraphql({document:copyJson(logical) as unknown as Document,policy:copyJson(policy) as unknown as import('./ddd-graphql/entities').DddGraphqlEntityPolicy,lossPolicy})) as import('./ddd-graphql/entities').DddGraphqlEntityProjection;},
  projectDddToGraphql(logical:Document,policy:import('./ddd-graphql').DddGraphqlPolicy,lossPolicy:'strict'|'report'):import('./ddd-graphql').DddGraphqlProjection{return call(()=>engine['ddd-json-schema-projection'].projectDddToGraphql({document:copyJson(logical) as unknown as Document,policy:copyJson(policy) as unknown as import('./ddd-graphql').DddGraphqlPolicy,lossPolicy})) as import('./ddd-graphql').DddGraphqlProjection;},
  verifyDddGraphqlProjection(input:import('./ddd-graphql').DddGraphqlProjection,currentTarget?:Document):import('./ddd-graphql').DddGraphqlProjection{return call(()=>engine['ddd-json-schema-projection'].verifyDddGraphqlProjection({receipt:copyJson(input) as unknown as import('./ddd-graphql').DddGraphqlProjection|import('./ddd-graphql/entities').DddGraphqlEntityProjection,...(currentTarget?{currentTarget:copyJson(currentTarget) as unknown as Document}:{})}));},
  recoverDddFromGraphql(input:import('./ddd-graphql').DddGraphqlProjection,currentTarget:Document):Document{return call(()=>engine['ddd-json-schema-projection'].recoverDddFromGraphql({receipt:copyJson(input) as unknown as import('./ddd-graphql').DddGraphqlProjection,currentTarget:copyJson(currentTarget) as unknown as Document})) as Document;},
  recoverDddGraphqlNative(input:import('./ddd-graphql').DddGraphqlProjection,currentTarget:Document):string{return call(()=>engine['ddd-json-schema-projection'].recoverDddGraphqlNative({receipt:copyJson(input) as unknown as import('./ddd-graphql').DddGraphqlProjection,currentTarget:copyJson(currentTarget) as unknown as Document})) as string;},
  validateSqlServerRelationshipLayout(logical:Document,binding:Document,policy:import('./binding-sqlserver/relationship-layout').SqlServerRelationshipLayoutPolicy,lossPolicy:'strict'|'report'):import('./binding-sqlserver/relationship-layout').SqlServerRelationshipLayoutResult{return call(()=>engine['ddd-json-schema-projection'].validateSqlServerRelationshipLayout({document:copyJson(logical) as unknown as Document,binding:copyJson(binding) as unknown as Document,policy:copyJson(policy) as unknown as import('./binding-sqlserver/relationship-layout').SqlServerRelationshipLayoutPolicy,lossPolicy})) as import('./binding-sqlserver/relationship-layout').SqlServerRelationshipLayoutResult;},
  validatePostgresqlRelationshipLayout(logical:Document,binding:Document,policy:import('./ddd-postgresql/relationship-layout').PostgresqlRelationshipLayoutPolicy,lossPolicy:'strict'|'report'):import('./ddd-postgresql/relationship-layout').PostgresqlRelationshipLayoutResult{return call(()=>engine['ddd-json-schema-projection'].validatePostgresqlRelationshipLayout({document:copyJson(logical) as unknown as Document,binding:copyJson(binding) as unknown as Document,policy:copyJson(policy) as unknown as import('./ddd-postgresql/relationship-layout').PostgresqlRelationshipLayoutPolicy,lossPolicy})) as import('./ddd-postgresql/relationship-layout').PostgresqlRelationshipLayoutResult;},
 });
}
