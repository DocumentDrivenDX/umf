// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Diagnostic,Document,Element} from '../model/types';
import type {TableDeclaration,TableLifecyclePayload,TableRef} from '../extensions/tables';
import type {AccountingContext} from '../model/internal/accounting-context';
export interface TableDeploymentConfiguration {
 module:string;schema:string;ownerRole:string;personRole:string;batchRole:string;
 groupRoles:Record<string,string>;
}
export interface TableDeploymentStep {
 id:string;kind:'table'|'foreignKey'|'index'|'policy'|'grant'|'comment';sourcePath:string;
 transaction:'required';sql:string;
}
/** Source-site operation tags for the internal inventory planner. Never serialized in TableDeploymentBundle. */
export interface InternalTableDeploymentOperation {
 operation:'create-table'|'enable-rls'|'force-rls'|'add-foreign-key'|'add-index'|'revoke-public'|'create-policy'|'grant-table'|'set-comment'|'grant-schema-usage';
 subject:
  |{kind:'table';table:string;record:TableRef;declaration:TableDeclaration;catalog:{columns:TableColumnExpectation[];keys:TableDeploymentBundle['expectedCatalog']['keys'];checks:TableDeploymentBundle['expectedCatalog']['checks']}}
  |{kind:'tableState';table:string;record:TableRef}
  |{kind:'foreignKey';table:string;id:string}
  |{kind:'index';table:string;id:string}
  |{kind:'publicGrant';table:string;privilege:'all'}
  |{kind:'policy';table:string;audience:'person'|'batch';command:'select'|'insert'|'update'|'delete'}
  |{kind:'tableGrant';table:string;role:string;privilege:'select'|'insert'|'update'|'delete';columns:string[]|null}
  |{kind:'comment';table:string;column:string|null;text:string}
  |{kind:'schema-grant';schema:string;audiences:['person','batch'];privilege:'USAGE'};
}
export interface InternalTableDeploymentOperationRecord extends InternalTableDeploymentOperation {
 stepId:string;sourcePath:string;kind:TableDeploymentStep['kind'];transaction:'required';sql:string;
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
 path:string;steps:TableDeploymentStep[];accounting?:AccountingContext;
 field(ref:TableRef):Element;
 column(table:TableDeclaration,ref:TableRef):string;
 table(ref:TableRef):TableDeclaration;
 relation(table:TableDeclaration):string;
 add(kind:TableDeploymentStep['kind'],path:string,sql:string,operation:InternalTableDeploymentOperation):void;
}
