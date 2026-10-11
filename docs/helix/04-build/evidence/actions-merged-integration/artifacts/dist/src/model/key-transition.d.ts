import { type Document, type Module, type Json } from './types';
export interface KeyCandidateDocument {
    umf: '0.6.0';
    id: string;
    vocabularies: Document['vocabularies'];
    modules: Module[];
    extensions?: Record<string, Json>;
    [key: string]: unknown;
}
declare const reason: 'Legacy key, keys and members are opaque; no ownership or identity inferred';
export interface KeyUpgradeReceipt {
    operation: 'upgrade-key-envelope';
    version: '1.0.0';
    source: Document;
    target: KeyCandidateDocument;
    residuals: {
        path: string;
        value: Json;
        reason: typeof reason;
    }[];
}
export interface KeyRollbackReceipt {
    operation: 'rollback-key-envelope';
    version: '1.0.0';
    source: KeyCandidateDocument;
    target: Document;
    receipt: KeyUpgradeReceipt;
    reason: 'Original envelope restored; all subsequent content retained in source, not applied to legacy target';
}
/** Explicit opt-in: every element collision is archived, even if it looks like a valid key or membership assertion. */
export declare function upgradeKeyEnvelope(input: Document): KeyUpgradeReceipt;
/** Source consistency, not authentication. Later assertions stay in the separately retained current envelope. */
export declare function rollbackKeyEnvelope(input: KeyUpgradeReceipt, current: KeyCandidateDocument): KeyRollbackReceipt;
export {};
