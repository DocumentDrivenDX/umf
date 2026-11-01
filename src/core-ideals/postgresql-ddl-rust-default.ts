// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document} from '../model/types';
import {UmfError} from '../model/types';
import type {PostgresqlBackend} from '../adapters/postgresql';
import type {PostgresqlDdlDeclarations} from '../adapters/postgresql/declarations';
import type {PostgresqlDdlKindRequest,PostgresqlDdlKinds} from './postgresql-ddl-kinds';
type Guard=(error:unknown)=>boolean;
interface Engine {postgresql:{getDdlDeclarations(fields:{document:Document}):unknown;prepareDdlParserRequest(fields:{source:Document;request:PostgresqlDdlKindRequest}):unknown;classifyDdlRecord(fields:{source:Document;request:PostgresqlDdlKindRequest;parser:unknown}):unknown;verifyDdlKinds(fields:{receipt:PostgresqlDdlKinds;current:Document;parser:unknown}):unknown;recoverDdlKinds(fields:{receipt:PostgresqlDdlKinds;current:Document;parser:unknown}):unknown}}
const CONTROL=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);
function raise(error:unknown,isNative:Guard):never{if(!isNative(error))throw error;const e=error as {code?:unknown;message?:unknown;path?:unknown};if(typeof e.code!=='string'||CONTROL.has(e.code)||!e.code.startsWith('POSTGRESQL_')&&e.code!=='REQUEST')throw error;throw new UmfError(e.code,String(e.message??''),typeof e.path==='string'?e.path:'')}
async function parserEvidence(engine:Engine,source:Document,request:PostgresqlDdlKindRequest,backend:PostgresqlBackend,isNativeUmfCoreError:Guard):Promise<unknown>{
 if(backend?.identity!=='@libpg-query/parser@17.6.10'||typeof backend.parse!=='function')throw new UmfError('POSTGRESQL_DDL_KIND_PARSER','Pinned PostgreSQL parser backend required');
 let prepared:{sql:string};
 try{prepared=engine.postgresql.prepareDdlParserRequest({source,request}) as {sql:string}}catch(error){raise(error,isNativeUmfCoreError)}
 // The caller owns only the admitted parser capability. Rust checks the returned AST against its retained tree.
 return backend.parse(prepared.sql);
}
export function createPostgresqlDdlRustDefault(engine:Engine,isNativeUmfCoreError:Guard=()=>false){return Object.freeze({
 getPostgresqlDdlDeclarations(document:Document):PostgresqlDdlDeclarations{try{return engine.postgresql.getDdlDeclarations({document}) as PostgresqlDdlDeclarations}catch(error){raise(error,isNativeUmfCoreError)}},
 async classifyPostgresqlDdlRecord(source:Document,request:PostgresqlDdlKindRequest,backend:PostgresqlBackend):Promise<PostgresqlDdlKinds>{const parser=await parserEvidence(engine,source,request,backend,isNativeUmfCoreError);try{return engine.postgresql.classifyDdlRecord({source,request,parser}) as PostgresqlDdlKinds}catch(error){raise(error,isNativeUmfCoreError)}},
 async recoverPostgresqlDdlKinds(receipt:PostgresqlDdlKinds,current:Document,backend:PostgresqlBackend):Promise<string>{const parser=await parserEvidence(engine,receipt.source,receipt.request,backend,isNativeUmfCoreError);try{return engine.postgresql.recoverDdlKinds({receipt,current,parser}) as string}catch(error){raise(error,isNativeUmfCoreError)}},
})}
