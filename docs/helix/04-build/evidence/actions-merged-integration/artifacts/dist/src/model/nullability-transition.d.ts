import { type Document, type Json } from './types';
export { default as nullabilityTransitionSchema } from '../../spec/core/nullability-transition.schema.json';
export interface NullabilityUpgradeReceipt {
    operation: 'upgrade-nullability-envelope';
    version: '1.0.0';
    source: Document;
    target: Document;
    residuals: {
        path: string;
        value: Json;
        reason: 'Legacy nullability is opaque; no availability assertion inferred';
    }[];
}
export interface NullabilityRollbackReceipt {
    operation: 'rollback-nullability-envelope';
    version: '1.0.0';
    source: Document;
    target: Document;
    receipt: NullabilityUpgradeReceipt;
    reason: 'Original envelope restored; all subsequent content retained in source, not applied to legacy target';
}
/** Explicit version opt-in. Every legacy nullability is archived, including known-looking strings. */
export declare function upgradeNullabilityEnvelope(input: Document): NullabilityUpgradeReceipt;
/** Restore original model; retain the entire current model separately, including later assertions/edits. */
export declare function rollbackNullabilityEnvelope(input: NullabilityUpgradeReceipt, current: Document): NullabilityRollbackReceipt;
