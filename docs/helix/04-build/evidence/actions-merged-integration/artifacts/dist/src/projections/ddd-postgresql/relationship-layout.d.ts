import { type Document, type Json, type Diagnostic } from '../../model/types';
import { type BindingFieldRef } from '../../extensions/binding';
import type { CoreKeyFieldReference } from '../../validation/keys';
export interface PostgresqlLayoutType {
    sqlType: string;
    nullable: boolean;
    collation: null | 'C';
}
export interface PostgresqlLayoutField extends PostgresqlLayoutType {
    coreField: CoreKeyFieldReference;
    boundField: BindingFieldRef;
    table: string;
    column: string;
}
export interface PostgresqlLayoutKeyComponent extends PostgresqlLayoutType {
    keyField: CoreKeyFieldReference;
    boundField: BindingFieldRef;
    column: string;
}
export interface PostgresqlLayoutKey {
    record: CoreKeyFieldReference;
    key: string;
    table: string;
    constraint: string;
    components: PostgresqlLayoutKeyComponent[];
}
export interface PostgresqlLayoutKeyRef extends CoreKeyFieldReference {
    key: string;
}
export interface PostgresqlLayoutEndpointComponent extends PostgresqlLayoutType {
    keyField: CoreKeyFieldReference;
    endpointField: BindingFieldRef;
    endpointColumn: string;
    carrierField?: BindingFieldRef;
    carrierColumn: string;
}
export interface PostgresqlRelationshipLayout {
    relationship: {
        module: string;
        id: string;
    };
    storage: 'foreign_key' | 'junction' | 'edge';
    carrierTable: string;
    targetKey: PostgresqlLayoutKeyRef;
    targetConstraint: string;
    targetComponents: PostgresqlLayoutEndpointComponent[];
    sourceKey?: PostgresqlLayoutKeyRef;
    sourceConstraint?: string;
    sourceComponents?: PostgresqlLayoutEndpointComponent[];
    associationRecord?: CoreKeyFieldReference;
    associationKey?: PostgresqlLayoutKeyRef;
    discriminator?: PostgresqlLayoutType & {
        column: string;
        value: string;
    };
}
export interface PostgresqlRelationshipLayoutPolicy {
    profile: 'postgresql-relationship-layout-1';
    targetVersion: string;
    fieldLayouts: PostgresqlLayoutField[];
    keyLayouts: PostgresqlLayoutKey[];
    relationshipLayouts: PostgresqlRelationshipLayout[];
}
export interface PostgresqlRelationshipLayoutResult {
    operation: 'validate-postgresql-relationship-layout';
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
    candidate?: PostgresqlRelationshipLayoutPolicy;
}
/** Validate retained metadata only. A candidate is a policy, never SQL or native enforcement. */
export declare function validatePostgresqlRelationshipLayout(logicalInput: Document, bindingInput: Document, policyInput: PostgresqlRelationshipLayoutPolicy, lossPolicy: 'strict' | 'report'): PostgresqlRelationshipLayoutResult;
