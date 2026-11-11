// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreKeyTupleReceipt} from '../../model/key-tuple';
import type {ActionManifest} from './manifest-types';
import type {ActionPlanArtifact} from './plan-types';

export interface SelectedActionRow {
 entity:ActionManifest['items'][number]['entity'];
 guard:ActionManifest['items'][number]['guard'];
 keyReceipt:CoreKeyTupleReceipt;
}
export interface ActionManifestConstruction {
 plan:ActionPlanArtifact;action:ActionManifest['action'];basis:ActionManifest['basis'];rows:SelectedActionRow[];
}
export interface ConstructedActionManifest {
 artifact:ActionPlanArtifact;keyReceipts:CoreKeyTupleReceipt[];sealed:false;complete:false;authority:false;
}
