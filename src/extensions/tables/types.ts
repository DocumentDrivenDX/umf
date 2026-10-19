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
export type TableRowRule={kind:'deny'|'allow'}|{kind:'owner'|'memberOf';field:TableRef}|{kind:'memberOfRole';role:string}|{kind:'any'|'all';rules:TableRowRule[]}|{kind:'via';path:TableRelationshipStep[];rule:TableRowRule};
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
