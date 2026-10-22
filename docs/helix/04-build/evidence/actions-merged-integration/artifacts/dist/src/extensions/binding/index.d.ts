import { Registry } from '../../registry/registry';
import { type Document, type ExtensionPackage, type Json, type Validation } from '../../model/types';
export declare const BINDING_EXTENSION = "umf.binding";
export declare const stableBindingPackage: ExtensionPackage;
export declare const bindingPackage: ExtensionPackage;
export interface BindingElementRef {
    module: string;
    element: string;
}
export interface BindingFieldRef extends BindingElementRef {
    field?: string;
}
export interface BindingRelationshipRef {
    module: string;
    name: string;
}
export interface BindingElement extends BindingElementRef {
    partition?: string | null;
    table?: string;
}
export interface BindingField extends BindingFieldRef {
    storage: 'column' | 'embedded';
    column?: string;
    documentColumn?: string;
    path?: string[];
}
export interface StableBindingRelationshipRef {
    module: string;
    id: string;
}
export interface StableBindingRelationship extends StableBindingRelationshipRef {
    storage: 'edge' | 'foreign_key' | 'junction' | 'inline';
}
export interface BindingRelationship extends BindingRelationshipRef {
    storage: 'edge' | 'foreign_key' | 'junction' | 'inline';
}
export type BindingIndexTarget = {
    field: BindingFieldRef;
} | {
    documentPath: {
        field: BindingFieldRef;
        path: string[];
    };
};
export interface BindingIndex {
    name: string;
    kind: 'btree' | 'hash' | 'gin' | 'gist' | 'expression' | 'partial' | 'unique' | 'clustering';
    on: BindingIndexTarget[];
    predicate?: {
        language: string;
        version: string;
        expression: string;
    };
    unique: boolean;
    include?: BindingFieldRef[];
}
export interface BindingPayload {
    profile: 'umf-binding-1' | 'umf-binding-2';
    logical: {
        documentId: string;
        coreVersion: string;
    };
    target: {
        system: string;
        version: string;
        subset: string;
    };
    elements: BindingElement[];
    fields: BindingField[];
    relationships: (BindingRelationship | StableBindingRelationship)[];
    indexes: BindingIndex[];
    [key: string]: unknown;
}
export declare function bindingRegistry(): Registry;
/** Validate a separate binding document against an explicitly supplied logical model. */
export declare function inspectBinding(binding: Document, logical: Document): Validation;
export declare function readBindingDocument(text: string, logical: Document, format?: 'json' | 'yaml'): Document;
export declare function writeBindingDocument(binding: Document, logical: Document, format?: 'json' | 'yaml'): string;
export declare function getBinding(binding: Document, logical: Document): BindingPayload;
export interface BindingIndexOutcome {
    name: string;
    path: string;
    outcome: 'exact' | 'approximated' | 'not-expressible' | 'unknown';
    reason?: string;
}
export interface BindingIndexProjection {
    status: 'projected' | 'reported' | 'blocked';
    source: Document;
    logical: Document;
    target: BindingPayload['target'];
    outcomes: BindingIndexOutcome[];
    candidate?: BindingIndex[];
}
/** Qualifies planned index carriers. Native DDL/catalog validation is a separate gate. */
export declare function projectBindingIndexes(binding: Document, logical: Document, lossPolicy: 'strict' | 'report'): BindingIndexProjection;
export interface BindingMigrationReceipt {
    profile: 'umf-binding-migration-1';
    original: Document;
    logical: Document;
    migrated: Document;
    mappings: {
        path: string;
        original: BindingRelationship;
        stable: StableBindingRelationship;
    }[];
}
export interface BindingMigrationResult {
    document: Document;
    receipt: BindingMigrationReceipt;
}
/** Explicit, atomic name-to-ID migration against the caller's exact paired model. */
export declare function migrateBindingRelationships(binding: Document, logical: Document): BindingMigrationResult;
export interface BindingRollbackResult {
    document: Document;
    residuals: {
        path: string;
        reason: string;
        value: Json;
    }[];
}
/** Restore the exact original; retain every later edit explicitly, without name reassociation. */
export declare function rollbackBindingRelationships(current: Document, logical: Document, receipt: BindingMigrationReceipt): BindingRollbackResult;
