// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreLiteral} from '../../model/schema-literals';
export interface TableRef {module:string;element:string}
export interface TableKeyRef {record:TableRef;key:string}
export type TableNativeType={kind:'boolean'|'text'|'int2'|'int4'|'int8'|'float4'|'float8'|'date'|'timestamp'|'timestamptz'|'uuid'|'bytea'}|{kind:'varchar'|'char';length:number}|{kind:'numeric';precision:number;scale:number};
export type TableDefault={kind:'literal';value:CoreLiteral}|{kind:'currentTimestamp'}|{kind:'randomUuid'};
export interface TableColumn {field:TableRef;name:string;nativeType:TableNativeType;default?:TableDefault;generated?:{kind:'identity';generation:'always'|'byDefault'};immutable?:boolean}
export type TableExpression={op:'field';field:TableRef}|{op:'literal';value:CoreLiteral}|{op:'eq'|'ne'|'lt'|'le'|'gt'|'ge';left:TableExpression;right:TableExpression}|{op:'and'|'or';args:TableExpression[]}|{op:'not'|'isNull';arg:TableExpression}|{op:'in';arg:TableExpression;values:CoreLiteral[]};
export interface TableRelationshipRef {module:string;id:string}
export interface TableRelationshipStep extends TableRelationshipRef {direction:'forward'|'inverse'}
export type TableRowRule={kind:'deny'|'allow'}|{kind:'owner'|'memberOf';field:TableRef}|{kind:'memberOfRole';role:string}|{kind:'any'|'all';rules:TableRowRule[]}|{kind:'via';path:TableRelationshipStep[];rule:TableRowRule}|{kind:'related';record:TableRef;matches:{source:TableRef;target:TableRef}[];rule:TableRowRule};
export type TableCommand='select'|'insert'|'update'|'delete';
export type TableCommandRules=Record<TableCommand,TableRowRule>;
export interface TablePolicy {mode:'native-rls';person:TableCommandRules;batch:TableCommandRules}
export interface TableIndex {id:string;name:string;fields:TableRef[];unique:boolean;include:TableRef[]}
export interface TableCheck {id:string;name:string;expression:TableExpression}
export interface TableForeignKey {id:string;name:string;fields:TableRef[];target:TableKeyRef;onUpdate:'restrict'|'noAction'|'cascade'|'setNull';onDelete:'restrict'|'noAction'|'cascade'|'setNull';deferrable:false|'immediate'|'deferred';relationship?:TableRelationshipRef}
export interface TableDeclaration {id:string;record:TableRef;name:string;columns:TableColumn[];indexes:TableIndex[];checks:TableCheck[];foreignKeys:TableForeignKey[];policy:TablePolicy}
export interface TableFieldValue {field:TableRef;value:CoreLiteral}
export interface TableSeedRow {table:string;values:TableFieldValue[]}
export interface TableSeedSet {id:string;rows:TableSeedRow[];conflict:'error'|'ignore'}
export interface TableLifecyclePayload {profile:'postgresql18/0.1';tables:TableDeclaration[];seedSets:TableSeedSet[];commands:unknown[]}

/** Named operation declarations; interpretation never grants native authority. */
export type TableOperationValue={kind:'parameter';parameter:string}|{kind:'literal';value:CoreLiteral}|{kind:'currentTimestamp'};
export type TableOperationPredicate={op:'all'}|{op:'and';args:TableOperationPredicate[]}|{op:'or';args:TableOperationPredicate[]}|{op:'not';arg:TableOperationPredicate}|{op:'isNull';field:TableRef}|{op:'in';field:TableRef;values:TableOperationValue[]}|{op:'eq'|'ne'|'lt'|'le'|'gt'|'ge'|'startsWith';field:TableRef;value:TableOperationValue};
export interface TableOperationAssignment {field:TableRef;value:TableOperationValue}
export type TableOperationBody=
 |{kind:'read';table:string;fields:TableRef[];where:TableOperationPredicate;orderBy:{field:TableRef;direction:'asc'|'desc'}[];result:'many'|'one'|'optional'|'page'|'count';maxRows:number;cursorKey?:string}
 |{kind:'insert';table:string;values:TableOperationAssignment[];returning:TableRef[];maxRows:1}
 |{kind:'update';table:string;where:TableOperationPredicate;values:TableOperationAssignment[];returning:TableRef[];maxRows:number}
 |{kind:'delete';table:string;where:TableOperationPredicate;returning:TableRef[];maxRows:number}
 |{kind:'upsert';table:string;conflictKey:string;values:TableOperationAssignment[];onConflict:'ignore'|'update';updateFields:TableRef[];returning:TableRef[];maxRows:1};
export interface TableOperation {
 version:'umf.table-operation/0.1';id:string;
 parameters:{id:string;field:TableRef}[];
 body:TableOperationBody;
 consistency:'statement'|'transaction';
 replay:'none'|'caller-key-required'|'caller-key-optional';
 batch?:{maxItems:number};
}
