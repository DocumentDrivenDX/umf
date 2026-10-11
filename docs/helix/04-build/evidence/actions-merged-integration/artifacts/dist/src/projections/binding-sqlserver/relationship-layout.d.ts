import { type Document, type Json, type Diagnostic } from '../../model/types';
import { type BindingFieldRef } from '../../extensions/binding';
import type { CoreKeyFieldReference } from '../../validation/keys';
export interface SqlServerLayoutType {
    sqlType: string;
    nullable: boolean;
    collation: null | 'Latin1_General_100_BIN2';
}
export interface SqlServerLayoutField extends SqlServerLayoutType {
    coreField: CoreKeyFieldReference;
    boundField: BindingFieldRef;
    table: string;
    column: string;
}
export interface SqlServerLayoutKeyComponent extends SqlServerLayoutType {
    keyField: CoreKeyFieldReference;
    boundField: BindingFieldRef;
    column: string;
}
export interface SqlServerLayoutKey {
    record: CoreKeyFieldReference;
    key: string;
    table: string;
    constraint: string;
    components: SqlServerLayoutKeyComponent[];
}
export interface SqlServerLayoutKeyRef extends CoreKeyFieldReference {
    key: string;
}
export interface SqlServerLayoutEndpointComponent extends SqlServerLayoutType {
    keyField: CoreKeyFieldReference;
    endpointField: BindingFieldRef;
    endpointColumn: string;
    carrierField?: BindingFieldRef;
    carrierColumn: string;
}
export interface SqlServerRelationshipLayout {
    relationship: {
        module: string;
        id: string;
    };
    storage: 'foreign_key' | 'junction' | 'edge';
    carrierTable: string;
    targetKey: SqlServerLayoutKeyRef;
    targetConstraint: string;
    targetComponents: SqlServerLayoutEndpointComponent[];
    sourceKey?: SqlServerLayoutKeyRef;
    sourceConstraint?: string;
    sourceComponents?: SqlServerLayoutEndpointComponent[];
    associationRecord?: CoreKeyFieldReference;
    associationKey?: SqlServerLayoutKeyRef;
    discriminator?: SqlServerLayoutType & {
        column: string;
        value: string;
    };
}
export interface SqlServerRelationshipLayoutPolicy {
    profile: 'sqlserver-relationship-layout-1';
    targetVersion: string;
    fieldLayouts: SqlServerLayoutField[];
    keyLayouts: SqlServerLayoutKey[];
    relationshipLayouts: SqlServerRelationshipLayout[];
}
export interface SqlServerRelationshipLayoutResult {
    operation: 'validate-sqlserver-relationship-layout';
    version: '1.0.0';
    status: 'validated' | 'reported' | 'blocked';
    lossPolicy: 'strict' | 'report';
    logical: Document;
    binding: Document;
    policy: Json;
    diagnostics: Diagnostic[];
    residuals: {
        source: 'logical' | 'binding' | 'policy';
        path: string;
        reason: string;
        value: Json;
    }[];
    candidate?: SqlServerRelationshipLayoutPolicy;
}
/** Validate retained metadata only. A candidate is a policy, never SQL or native enforcement. */
export declare function validateSqlServerRelationshipLayout(logicalInput: Document, bindingInput: Document, policyInput: SqlServerRelationshipLayoutPolicy, lossPolicy: 'strict' | 'report'): SqlServerRelationshipLayoutResult;
