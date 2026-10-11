import { type Document, type Json } from './types';
export { default as facetTransitionSchema } from '../../spec/core/facet-transition.schema.json';
export interface FacetUpgradeReceipt {
    operation: 'upgrade-facet-envelope';
    version: '1.0.0';
    source: Document;
    target: Document;
    residuals: {
        path: string;
        value: Json;
        reason: 'Legacy facets are opaque; no value bounds inferred';
    }[];
}
export interface FacetRollbackReceipt {
    operation: 'rollback-facet-envelope';
    version: '1.0.0';
    source: Document;
    target: Document;
    receipt: FacetUpgradeReceipt;
    reason: 'Original envelope restored; all subsequent content retained in source, not applied to legacy target';
}
/** Explicit version opt-in. Every legacy facets member is archived, including known-looking values. */
export declare function upgradeFacetEnvelope(input: Document): FacetUpgradeReceipt;
/** Restore original model; retain the entire current model separately, including later assertions/edits. */
export declare function rollbackFacetEnvelope(input: FacetUpgradeReceipt, current: Document): FacetRollbackReceipt;
