// SPDX-License-Identifier: MIT OR Apache-2.0
export type {Relationship as CoreRelationship,RelationshipEndpoint,RelationshipTarget,RelationshipMultiplicity,Document as RelationshipCandidate} from '../generated/core-model';
export {validateDocument as validateRelationshipCandidate} from './document';
