// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../../model/types';
import type {Json,ExtensionPackage} from '../../model/types';
import type {GraphqlPayload} from './index';
import {Registry} from '../../registry/registry';
import manifest from '../../../../spec/extensions/graphql/package.json';

export interface GraphqlRustEngine {
  importGraphqlSchema(source:string,options:{id:string;mode?:'schema'|'fragment'}):Document;
  inspectGraphql(document:Document):{valid:boolean;complete:boolean;diagnostics:Diagnostic[]};
  exportGraphqlSchema(document:Document):string;
  getGraphqlAst(document:Document):GraphqlPayload['ast'];
  editGraphqlAst(document:Document,edit:(ast:GraphqlPayload['ast'])=>GraphqlPayload['ast']):Document;
  exportGraphqlBundle(document:Document):{schema:string;source:Document;diagnostics:Diagnostic[]};
  inspectGraphqlPayload(payload:Json):Diagnostic[];
}

/** Keep the six established GraphQL API signatures on the source-built Rust path. */
export function createGraphqlRustDefault(engine:GraphqlRustEngine){
  return Object.freeze({
    graphqlRegistry:()=>new Registry().register(manifest as unknown as ExtensionPackage,(payload)=>engine.inspectGraphqlPayload(payload)),
    importGraphqlSchema:(source:string,options:{id:string;mode?:'schema'|'fragment'})=>engine.importGraphqlSchema(source,options),
    inspectGraphql:(document:Document)=>engine.inspectGraphql(document),
    exportGraphqlSchema:(document:Document)=>engine.exportGraphqlSchema(document),
    getGraphqlAst:(document:Document)=>engine.getGraphqlAst(document),
    editGraphqlAst:(document:Document,edit:(ast:GraphqlPayload['ast'])=>GraphqlPayload['ast'])=>engine.editGraphqlAst(document,edit),
    exportGraphqlBundle:(document:Document)=>engine.exportGraphqlBundle(document),
  });
}
