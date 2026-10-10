import { type Document, type Json } from './types';
export { default as fieldTransitionSchema } from '../../spec/core/field-transition.schema.json';
export interface FieldUpgradeReceipt {
    operation: 'upgrade-field-envelope';
    version: '1.0.0';
    source: Document;
    target: Document;
    residuals: {
        path: string;
        value: Json;
        reason: 'Legacy kind is opaque; no core assertion inferred';
    }[];
}
export interface FieldRollbackReceipt {
    operation: 'rollback-field-envelope';
    version: '1.0.0';
    source: Document;
    target: Document;
    receipt: FieldUpgradeReceipt;
    reason: 'Original envelope restored; all subsequent content retained in source, not applied to legacy target';
}
/** Explicit version opt-in. Every legacy kind is archived, including known-looking strings. */
export declare function upgradeFieldEnvelope(input: Document): FieldUpgradeReceipt;
/** Restore original model; retain the entire current model separately, including later assertions/edits. */
export declare function rollbackFieldEnvelope(input: FieldUpgradeReceipt, current: Document): FieldRollbackReceipt;
