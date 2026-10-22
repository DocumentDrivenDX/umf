import { type Document, type Json } from './types';
import type { CoreKeyDefinition } from '../validation/keys';
import type { CoreKeyIdentity } from './key-tuple';
export interface CoreRecordIdentity {
    module: string;
    element: string;
}
export interface CoreKeyRequest {
    id: string;
    name: string;
    fields: CoreRecordIdentity[];
    primary?: boolean;
}
interface Declaration {
    version: '1.0.0' | '2.0.0';
    source: Document;
    target: Document;
    identity: CoreRecordIdentity;
    provenance: {
        origin: 'authored';
        idealPath: string;
        basis: 'explicit-author-declaration';
        nativePath: null;
        binding: {
            id: string;
            version: '1.0.0' | '2.0.0';
        };
    };
}
export interface CoreKeyDeclaration extends Declaration {
    operation: 'declare-core-key';
    request: CoreKeyRequest;
}
export interface CoreRecordMembersDeclaration extends Declaration {
    operation: 'declare-core-record-members';
    request: CoreRecordIdentity[];
}
export type CoreKeyMeaning = {
    state: 'missing' | 'inapplicable';
} | {
    state: 'legacy';
    value: Json;
} | {
    state: 'known' | 'partial';
    keys: CoreKeyDefinition[];
    uninterpretedPaths: string[];
};
export interface CoreKeyInspection {
    operation: 'inspect-core-keys';
    version: '1.0.0' | '2.0.0';
    source: Document;
    identity: CoreRecordIdentity;
    path: string;
    meaning: CoreKeyMeaning;
    provenance: 'unverified';
}
export interface CoreKeyLookup {
    operation: 'lookup-core-key';
    version: '1.0.0' | '2.0.0';
    source: Document;
    identity: CoreKeyIdentity;
    path: string;
    key: CoreKeyDefinition;
    uninterpretedPaths: string[];
    provenance: 'unverified';
}
export type CoreKeyOperation = CoreKeyDeclaration | CoreRecordMembersDeclaration | CoreKeyInspection | CoreKeyLookup;
export declare function inspectCoreKeys(input: Document, identity: CoreRecordIdentity): CoreKeyInspection;
export declare function lookupCoreKey(input: Document, identityInput: CoreKeyIdentity): CoreKeyLookup;
export declare function declareCoreRecordMembers(input: Document, identity: CoreRecordIdentity, requestInput: CoreRecordIdentity[]): CoreRecordMembersDeclaration;
export declare function declareCoreKey(input: Document, identity: CoreRecordIdentity, requestInput: CoreKeyRequest): CoreKeyDeclaration;
/** Recomputes retained meaning and current context; not cryptographic authorship. */
export declare function verifyCoreKeyOperation(input: CoreKeyOperation, current: Document): CoreKeyOperation;
export {};
