// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic,Json,ExtensionPackage} from '../../model/types';
import type {GraphqlPayload} from './index';
import {Registry} from '../../registry/registry';
import manifest from '../../../spec/extensions/graphql/package.json';
import {UmfError} from '../../model/errors';

export interface GraphqlRustEngine {
  importGraphqlSchema(source:string,options:{id:string;mode?:'schema'|'fragment'}):Document;
  inspectGraphql(document:Document):{valid:boolean;complete:boolean;diagnostics:Diagnostic[]};
  exportGraphqlSchema(document:Document):string;
  getGraphqlAst(document:Document):GraphqlPayload['ast'];
  editGraphqlAst(document:Document,edit:(ast:GraphqlPayload['ast'])=>GraphqlPayload['ast']):unknown;
  exportGraphqlBundle(document:Document):{schema:string;source:Document;diagnostics:Diagnostic[]};
  inspectGraphqlPayload(payload:Json):Diagnostic[];
}

/** Keep the six established GraphQL API signatures on the source-built Rust path. */
export function createGraphqlRustDefault(engine:GraphqlRustEngine,isNativeUmfCoreError:(error:unknown)=>boolean,createRegistry:()=>Registry=()=>new Registry()){
  const invoke=<T>(operation:()=>T,callbackFailure?:{value:unknown;thrown:boolean}):T=>{
    try{return operation();}
    catch(error){if(callbackFailure?.thrown&&error===callbackFailure.value)throw error;if(isNativeUmfCoreError(error)){const native=error as Error&{code:string;path:string};if(native.code.startsWith('GRAPHQL_'))throw new UmfError(native.code,native.message,native.path);}throw error;}
  };
  return Object.freeze({
    graphqlRegistry:()=>createRegistry().register(manifest as unknown as ExtensionPackage,(payload)=>invoke(()=>engine.inspectGraphqlPayload(payload))),
    importGraphqlSchema:(source:string,options:{id:string;mode?:'schema'|'fragment'})=>invoke(()=>engine.importGraphqlSchema(source,options)),
    inspectGraphql:(document:Document)=>invoke(()=>engine.inspectGraphql(document)),
    exportGraphqlSchema:(document:Document)=>invoke(()=>engine.exportGraphqlSchema(document)),
    getGraphqlAst:(document:Document)=>invoke(()=>engine.getGraphqlAst(document)),
    editGraphqlAst:(document:Document,edit:(ast:GraphqlPayload['ast'])=>GraphqlPayload['ast'])=>{
      const callbackFailure:{value:unknown;thrown:boolean}={value:undefined,thrown:false};
      const wrapped=(ast:GraphqlPayload['ast'])=>{try{return edit(ast);}catch(error){callbackFailure.value=error;callbackFailure.thrown=true;throw error;}};
      return invoke(()=>engine.editGraphqlAst(document,wrapped) as Document,callbackFailure);
    },
    exportGraphqlBundle:(document:Document)=>invoke(()=>engine.exportGraphqlBundle(document)),
  });
}
