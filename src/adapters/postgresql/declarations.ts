// SPDX-License-Identifier: MIT OR Apache-2.0
import type {NativeJson} from '../../model/native-json';
import type {Diagnostic,Element} from '../../model/types';
export interface PostgresqlDdlColumn {path:string;element:Element;typeResolution:'builtin-syntax'|'unresolved';nativeColumn:NativeJson;}
export interface PostgresqlDdlDeclaration {path:string;statementIndex:number;kind:'create-table'|'create-foreign-table'|'alter-table'|'create-composite';schemaContext:string|null;requiresCatalogExpansion:boolean;relation:NativeJson;columns:PostgresqlDdlColumn[];nativeStatement:NativeJson;}
export interface PostgresqlDdlDeclarations {status:'observed'|'blocked';complete:false;declarations:PostgresqlDdlDeclaration[];unhandled:{path:string;nativeStatement:NativeJson}[];diagnostics:Diagnostic[];}
