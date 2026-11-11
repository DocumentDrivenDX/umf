// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from './types';
import type {CoreRelationshipIdentity} from './relationships';
import type {CoreRelationship,RelationshipEndpoint,RelationshipTarget} from '../validation/relationships';
export type CoreRelationshipSelectionSource=Document&{modules:(Document['modules'][number]&{relationships?:CoreRelationship[]})[]};
interface Navigation {name:string|null;from:RelationshipEndpoint[];to:RelationshipEndpoint[]}
export interface CoreRelationshipQuery {modules?:string[];names?:string[];identities?:CoreRelationshipIdentity[];sources?:RelationshipEndpoint[];targets?:RelationshipEndpoint[]}
export interface CoreRelationshipSelectionEntry {
 identity:CoreRelationshipIdentity;path:string;relationship:CoreRelationship;
 sources:{reference:RelationshipEndpoint;recordPath:string}[];
 targets:{reference:RelationshipTarget;recordPath:string;keyPath:string}[];
 associationRecord?:{reference:RelationshipEndpoint;recordPath:string};
 navigation:{forward:Navigation;reverse?:Navigation};uninterpretedPaths:string[];
}
export interface CoreRelationshipSelection {
 operation:'select-core-relationships';version:'2.0.0';source:CoreRelationshipSelectionSource;query:CoreRelationshipQuery;
 selection:CoreRelationshipSelectionEntry[];diagnostics:Diagnostic[];residuals:[];provenance:'unverified';navigationScope:'authored-presentation-only';
}
