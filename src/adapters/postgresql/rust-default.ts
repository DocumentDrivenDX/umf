// SPDX-License-Identifier: MIT OR Apache-2.0
import {UmfError} from '../../model/errors';
import type {Diagnostic, Document, ExtensionPackage} from '../../model/types';
import type {PostgresqlBackend} from './index';
import type {Registry} from '../../registry/registry';
import {postgresqlPackage} from './package';
import type {NativeJson} from "../../model/native-json";
import type {Json,Validation} from "../../model/types";

type ExportPostgresqlSql = (document: Document, backend: PostgresqlBackend) => Promise<string>;
type GetPostgresqlNode = (document: Document, path: string) => NativeJson;
type GetPostgresqlSource = (document: Document) => string;
type ImportPostgresqlSql = (source: string, backend: PostgresqlBackend, options: { id: string; }) => Promise<Document>;
type InspectPostgresql = (document: Document) => Validation;
type PostgresqlRegistry = () => Registry;
type ProposePostgresqlNodeEdit = (document: Document, path: string, text: string) => { document: Document; validation: Validation; };
type ValidatePostgresqlAst = (tree: unknown) => { valid: boolean | Promise<unknown>; complete: boolean; errors: Json; };

type ParserRequest = {
  token: string;
  backend: '@libpg-query/parser@17.6.10';
  astVersion: 170004;
  work: 'parse'|'deparse'|'codecRoundTrip';
  sql?: string;
  tree?: unknown;
};
type ParserResponse =
  | {kind:'parsed';tree:unknown}
  | {kind:'deparsed';sql:string}
  | {kind:'codecRoundTripped';tree:unknown};
type PostgresqlParserSessionEngine = {
  prepareImport(input:{source:string;id:string}):ParserRequest;
  cancel?(input:{token:string}):boolean;
  completeImport(input:{token:string;tree:unknown}):{done:true;document:unknown};
  prepareExport(input:{document:Document}):ParserRequest;
  completeExport(input:{token:string;response:ParserResponse}):
    | {done:false;request:ParserRequest}
    | {done:true;sql:string};
  editNode(input:{document:Document;pointer:string;text:string}):unknown;
  inspect(input:{document:Document}):unknown;
  getSource(input:{document:Document}):string;
  getNode(input:{document:Document;pointer:string}):unknown;
  inspectPayload(input:{payload:unknown}):unknown[];
  validateAst(input:{ast:unknown}):unknown;
};
type NativeCoreErrorGuard=(error:unknown)=>boolean;
const CONTROL_CODES=new Set(['RESOURCE_LIMIT','CANCELLED','METER_FAILURE','CANCELLATION_CHECK_FAILURE','CLOCK_CAPABILITY_REQUIRED','DEADLINE','DEADLINE_EXCEEDED']);

function publicError(error:unknown,isNative:NativeCoreErrorGuard):never {
  if(!isNative(error)||CONTROL_CODES.has((error as {code?:string})?.code??''))throw error;
  const native=error as {code?:unknown;message?:unknown;path?:unknown};
  if(typeof native.code==='string'&&(native.code.startsWith('POSTGRESQL_')||native.code==='REQUEST'||native.code==='JSON_SCHEMA_SYNTAX'||native.code==='JSON_SCHEMA_POINTER'))
    throw new UmfError(native.code,String(native.message??''),typeof native.path==='string'?native.path:'');
  throw error;
}

function cancel(engine:PostgresqlParserSessionEngine,token:unknown):void {
  if(typeof token!=='string')return;
  try{engine.cancel?.({token});}catch{/* preserve the parser callback failure */}
}

function requireBackend(backend:PostgresqlBackend):void {
  if(backend?.identity!=='@libpg-query/parser@17.6.10'||typeof backend.parse!=='function'||typeof backend.deparse!=='function'||typeof backend.codecRoundTrip!=='function')
    throw new UmfError('POSTGRESQL_BACKEND','Expected the explicitly supplied pinned parser/deparser backend');
}

function assertRequest(request:ParserRequest,work:ParserRequest['work']):void {
  if(!request||request.backend!=='@libpg-query/parser@17.6.10'||request.astVersion!==170004||request.work!==work||typeof request.token!=='string')
    throw new UmfError('POSTGRESQL_BACKEND','Rust returned an invalid PostgreSQL parser request');
}

/** Preserve the public explicit backend API while keeping document semantics and
 * the cumulative parser continuation state inside Rust. Host callback values
 * and exceptions pass through unchanged. */
export function createPostgresqlRustDefault(
  engine:PostgresqlParserSessionEngine,
  isNativeUmfCoreError:NativeCoreErrorGuard=()=>false,
  createRegistry:()=>Registry,
) {
  return Object.freeze({
    postgresqlRegistry():ReturnType<PostgresqlRegistry> {
      return createRegistry().register(postgresqlPackage as unknown as ExtensionPackage,(payload) => {
        try{return engine.inspectPayload({payload}) as Diagnostic[];}
        catch(error){publicError(error,isNativeUmfCoreError);}
      });
    },
    async importPostgresqlSql(source:string,backend:PostgresqlBackend,options:Parameters<ImportPostgresqlSql>[2]):Promise<Document> {
      requireBackend(backend);
      let request:ParserRequest;
      try{request=engine.prepareImport({source,id:options.id});}
      catch(error){publicError(error,isNativeUmfCoreError);}
      try{assertRequest(request,'parse');}catch(error){cancel(engine,request?.token);publicError(error,isNativeUmfCoreError);}
      if(typeof request.sql!=='string'){cancel(engine,request.token);throw new UmfError('POSTGRESQL_BACKEND','Rust omitted parse source');}
      let tree:unknown;
      try{tree=await backend.parse(request.sql);}catch(error){cancel(engine,request.token);throw error;}
      let completed:{done:true;document:unknown};
      try{completed=engine.completeImport({token:request.token,tree});}
      catch(error){cancel(engine,request.token);publicError(error,isNativeUmfCoreError);}
      return completed.document as Document;
    },
    async exportPostgresqlSql(document:Document,backend:PostgresqlBackend):ReturnType<ExportPostgresqlSql> {
      requireBackend(backend);
      let request:ParserRequest;
      try{request=engine.prepareExport({document});}
      catch(error){publicError(error,isNativeUmfCoreError);}
      let expectedWork:ParserRequest['work']='codecRoundTrip';
      for(let stage=0;stage<4;stage++){
        try{assertRequest(request,expectedWork);}catch(error){cancel(engine,request?.token);publicError(error,isNativeUmfCoreError);}
        let response:ParserResponse;
        if(request.work==='codecRoundTrip'){
          if(request.tree===undefined){cancel(engine,request.token);throw new UmfError('POSTGRESQL_BACKEND','Rust omitted AST for codec round trip');}
          try{response={kind:'codecRoundTripped',tree:await backend.codecRoundTrip(request.tree)};}catch(error){cancel(engine,request.token);throw error;}
        }else if(request.work==='deparse'){
          if(request.tree===undefined){cancel(engine,request.token);throw new UmfError('POSTGRESQL_BACKEND','Rust omitted AST for deparse');}
          try{response={kind:'deparsed',sql:await backend.deparse(request.tree)};}catch(error){cancel(engine,request.token);throw error;}
        }else{
          if(typeof request.sql!=='string'){cancel(engine,request.token);throw new UmfError('POSTGRESQL_BACKEND','Rust omitted SQL for reparse');}
          try{response={kind:'parsed',tree:await backend.parse(request.sql)};}catch(error){cancel(engine,request.token);throw error;}
        }
        let result:{done:false;request:ParserRequest}|{done:true;sql:string};
        try{result=engine.completeExport({token:request.token,response});}
        catch(error){cancel(engine,request.token);publicError(error,isNativeUmfCoreError);}
        if(result.done)return result.sql;
        request=result.request;
        expectedWork=expectedWork==='codecRoundTrip'?'deparse':'parse';
      }
      cancel(engine,request?.token);
      throw new UmfError('POSTGRESQL_BACKEND','Rust parser continuation exceeded its closed stage count');
    },
    proposePostgresqlNodeEdit(document:Document,pointer:string,text:string):ReturnType<ProposePostgresqlNodeEdit> {
      try{return engine.editNode({document,pointer,text}) as ReturnType<ProposePostgresqlNodeEdit>;}
      catch(error){publicError(error,isNativeUmfCoreError);}
    },
    inspectPostgresql(document:Document):ReturnType<InspectPostgresql> { try{return engine.inspect({document}) as ReturnType<InspectPostgresql>;}catch(error){publicError(error,isNativeUmfCoreError);} },
    getPostgresqlSource(document:Document):ReturnType<GetPostgresqlSource> { try{return engine.getSource({document}) as ReturnType<GetPostgresqlSource>;}catch(error){publicError(error,isNativeUmfCoreError);} },
    getPostgresqlNode(document:Document,pointer:string):ReturnType<GetPostgresqlNode> { try{return engine.getNode({document,pointer}) as ReturnType<GetPostgresqlNode>;}catch(error){publicError(error,isNativeUmfCoreError);} },
    inspectPostgresqlPayload(payload:unknown) { try{return engine.inspectPayload({payload});}catch(error){publicError(error,isNativeUmfCoreError);} },
    validatePostgresqlAst(ast:unknown):ReturnType<ValidatePostgresqlAst> { try{return engine.validateAst({ast}) as ReturnType<ValidatePostgresqlAst>;}catch(error){publicError(error,isNativeUmfCoreError);} },
  });
}
