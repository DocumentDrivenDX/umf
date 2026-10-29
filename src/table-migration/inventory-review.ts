// Compatibility types and safe entrypoints; implementation belongs to the
// request-owning inventory compiler.
import type {TableInventoryReviewedChangeKind,TableInventoryMigrationMarker,TableInventoryDiscoveryIntent} from './inventory-options';

export type TableInventoryTableReviewEffects=readonly ['new-physical-binding']|readonly ['ordinary-access-retired','stored-rows-irreversibly-purged','physical-binding-removed'];
export interface TableInventoryTableReview {
 profile:'umf.table-inventory-review/0.1';side:'previous'|'next';source:{format:'json';sha256:string};configuration:import('../model/types').Json;table:string;record:{module:string;element:string};meaning:import('../model/types').Json|null;intent:TableInventoryDiscoveryIntent;effects:TableInventoryTableReviewEffects;
}
export interface TableInventorySeedReview {
 profile:'umf.table-inventory-seed-retirement-review/0.1';side:'previous'|'next';source:{format:'json';sha256:string};configuration:import('../model/types').Json;id:string;definition:import('../model/types').Json;definitionDigest:string;originalSourceDigest:string;execution:'not-run'|'confirmed';retired:boolean;effects:readonly []|readonly ['original-definition-and-execution-retained-in-history','no-data-replay'];
}
export type TableInventoryReviewValue=TableInventoryTableReview|TableInventorySeedReview;
type TableInventoryCandidateBase=Omit<TableInventoryMigrationMarker,'kind'>;
type TableInventoryLegacyReviewKind=Exclude<TableInventoryReviewedChangeKind,'create-table'|'remove-table'|'table-removal-effects'|'retire-seed-history'|'conversion-effects'>;
export type TableInventoryReviewedChangeCandidate=
 |(TableInventoryCandidateBase&{kind:'create-table';oldValue:TableInventoryTableReview|null;newValue:TableInventoryTableReview;oldPath:null;newPath:string})
 |(TableInventoryCandidateBase&{kind:'remove-table'|'table-removal-effects';oldValue:TableInventoryTableReview;newValue:TableInventoryTableReview;oldPath:string;newPath:null})
 |(TableInventoryCandidateBase&{kind:'retire-seed-history';oldValue:TableInventorySeedReview;newValue:TableInventorySeedReview;oldPath:string;newPath:null})
 |(TableInventoryCandidateBase&{kind:TableInventoryLegacyReviewKind;oldValue:import('../model/types').Json|null;newValue:import('../model/types').Json|null;oldPath?:string|null;newPath?:string|null});

export {discoverInventoryReviewCandidatesWithVerifier,discoverInventoryReviewCandidates,inventoryMarker,irreversiblePurgeDisclosure} from './inventory';
