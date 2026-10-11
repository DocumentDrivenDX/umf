import { type Document, type Json } from './types';
export { default as cardinalityTransitionSchema } from '../../spec/core/cardinality-transition.schema.json';
export interface CardinalityUpgradeReceipt {
    operation: 'upgrade-cardinality-envelope';
    version: '1.0.0';
    source: Document;
    target: Document;
    residuals: {
        path: string;
        value: Json;
        reason: 'Legacy cardinality/itemType is opaque; no container or item meaning inferred';
    }[];
}
export interface CardinalityRollbackReceipt {
    operation: 'rollback-cardinality-envelope';
    version: '1.0.0';
    source: Document;
    target: Document;
    receipt: CardinalityUpgradeReceipt;
    reason: 'Original envelope restored; all subsequent content retained in source, not applied to legacy target';
}
/** Explicit version opt-in. Every legacy cardinality/itemType is archived, including known-looking values. */
export declare function upgradeCardinalityEnvelope(input: Document): CardinalityUpgradeReceipt;
/** Restore original model; retain the entire current model separately, including later assertions/edits. */
export declare function rollbackCardinalityEnvelope(input: CardinalityUpgradeReceipt, current: Document): CardinalityRollbackReceipt;
