import { type Document, type Json, type Diagnostic, type ExtensionPackage } from '../model/types';
export declare const SQLSERVER_RELATIONSHIPS_EXTENSION = "umf.sqlserver.relationships";
export declare const sqlserverRelationshipsPackage: ExtensionPackage;
export { default as sqlserverRelationshipClassificationSchema } from '../../spec/core/sqlserver-relationship-classification.schema.json';
export interface SqlServerRelationshipRequest {
    nativeSource: string;
    mode: 'strict' | 'report';
    profile: 'captured-foreign-keys';
}
export interface SqlServerRelationshipObservation {
    nativePath: string;
    table: {
        schema: string;
        name: string;
    };
    name: string;
    nativeForeignKey: Json;
    referencedKeys: {
        path: string;
        nativeKey: Json;
    }[];
    sourceFields: {
        module: string;
        element: string;
    }[];
    targetFields: {
        module: string;
        element: string;
    }[];
    enforcement: 'enabled-trusted' | 'enabled-untrusted' | 'disabled' | 'unknown';
    authorIntent: 'unknown';
    provenance: 'inferred';
    deleteAction: string;
    updateAction: string;
    notForReplication: boolean;
    resolution: 'captured-tuple-candidate' | 'unresolved';
}
declare const binding: {
    id: string;
    version: string;
    nativeVersion: string;
    subset: string;
};
export interface SqlServerRelationshipClassification {
    operation: 'classify-sqlserver-relationships';
    version: '1.0.0';
    status: 'classified' | 'blocked';
    source: Document;
    target?: Document;
    request: SqlServerRelationshipRequest;
    binding: typeof binding;
    observations: SqlServerRelationshipObservation[];
    residuals: {
        path: string;
        value: Json;
        reason: string;
        outcome: 'unknown' | 'not-expressible' | 'approximated';
        recovery: string;
    }[];
    diagnostics: Diagnostic[];
}
/** Permission-limited catalog observations; trust flags never establish authored relationship meaning. */
export declare function classifySqlServerRelationships(input: Document, options: SqlServerRelationshipRequest): SqlServerRelationshipClassification;
export declare function verifySqlServerRelationshipClassification(input: SqlServerRelationshipClassification, current: Document): SqlServerRelationshipClassification & {
    [x: string]: {};
};
export declare function recoverSqlServerRelationshipSource(input: SqlServerRelationshipClassification, current: Document): string;
