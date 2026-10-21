// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Diagnostic,Document,Element} from '../model/types';
import type {TableDeclaration,TableLifecyclePayload,TableRef} from '../extensions/tables';
export interface TableDeploymentConfiguration {
 module:string;schema:string;ownerRole:string;personRole:string;batchRole:string;
 groupRoles:Record<string,string>;
}
export interface TableDeploymentStep {
 id:string;kind:'table'|'foreignKey'|'index'|'policy'|'grant'|'comment';sourcePath:string;
 transaction:'required';sql:string;
}
export interface TableColumnExpectation {
 table:string;name:string;field:TableRef;sourcePath:string;
 typeSchema:'pg_catalog';typeName:string;typeMod:number;
 nullable:boolean;collation:'C'|null;identity:''|'a'|'d';
 definitionSql:string;
}
export interface TableConstraintExpectation {table:string;id:string;name:string;definitionSql:string}
export interface TableIndexExpectation extends TableConstraintExpectation {unique:boolean}
export interface TableDeploymentBundle {
 version:'umf.table-deployment/0.1'|'umf.table-deployment/0.2';canonicalization:'RFC8785';
 source:{format:'json'|'yaml';utf8:string};sourceDigest:string;
 configuration:TableDeploymentConfiguration;configurationDigest:string;
 module:string;profile:'postgresql18/0.1';
 steps:TableDeploymentStep[];
 expectedCatalog:{comments?:{table:string;column?:string;text:string}[];tables:TableDeclaration[];columns:TableColumnExpectation[];keys:(TableConstraintExpectation&{primary:boolean;columns:string[]})[];checks:TableConstraintExpectation[];foreignKeys:(TableConstraintExpectation&{targetKey:string})[];indexes:TableIndexExpectation[]};
 seedSets:TableLifecyclePayload['seedSets'];
 bundleDigest:string;nativeQualified:false;
}
export type TableDeploymentResult={status:'compiled';bundle:TableDeploymentBundle;diagnostics:[]}|{status:'blocked';diagnostics:Diagnostic[]};
export interface DeploymentContext {
 document:Document;payload:TableLifecyclePayload;configuration:TableDeploymentConfiguration;
 path:string;steps:TableDeploymentStep[];
 field(ref:TableRef):Element;
 column(table:TableDeclaration,ref:TableRef):string;
 table(ref:TableRef):TableDeclaration;
 relation(table:TableDeclaration):string;
 add(kind:TableDeploymentStep['kind'],path:string,sql:string):void;
}
