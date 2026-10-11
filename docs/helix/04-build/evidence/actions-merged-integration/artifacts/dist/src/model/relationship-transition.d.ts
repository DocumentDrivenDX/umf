import { type Document, type Json } from './types';
import { type RelationshipCandidate } from '../validation/relationships';
declare const reason: 'Legacy module relationships are opaque; no association inferred';
export interface RelationshipUpgradeReceipt {
    operation: 'upgrade-relationship-envelope';
    version: '1.0.0';
    source: Document;
    target: RelationshipCandidate;
    residuals: {
        path: string;
        value: Json;
        reason: typeof reason;
    }[];
}
export interface RelationshipRollbackReceipt {
    operation: 'rollback-relationship-envelope';
    version: '1.0.0';
    source: RelationshipCandidate;
    target: Document;
    receipt: RelationshipUpgradeReceipt;
    reason: 'Original envelope restored; all subsequent content retained in source, not applied to legacy target';
}
/** All module collisions are archived, including content that looks like a valid assertion. */
export declare function upgradeRelationshipEnvelope(input: Document): RelationshipUpgradeReceipt;
/** Restore exactly the old document; later assertions and native changes remain in source. */
export declare function rollbackRelationshipEnvelope(input: RelationshipUpgradeReceipt, current: RelationshipCandidate): RelationshipRollbackReceipt;
export declare function verifyRelationshipTransition(input: RelationshipUpgradeReceipt | RelationshipRollbackReceipt): RelationshipUpgradeReceipt | RelationshipRollbackReceipt;
export {};
