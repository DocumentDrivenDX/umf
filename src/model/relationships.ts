// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from './types';
import type {CoreRelationship,RelationshipEndpoint,RelationshipTarget,RelationshipMultiplicity} from '../validation/relationships';
export interface RelationshipModuleIdentity {module:string}
export interface CoreRelationshipIdentity extends RelationshipModuleIdentity {id:string}
export interface CoreRelationshipRequest {id:string;name:string;source:RelationshipEndpoint[];target:RelationshipTarget[];sourceMultiplicity:RelationshipMultiplicity;targetMultiplicity:RelationshipMultiplicity;targetLifecycle:'owned'|'independent'|'unspecified';directed:boolean;inverse?:string|null;associationRecord?:RelationshipEndpoint}
type Source=Document&{modules:(Document['modules'][number]&{relationships?:CoreRelationship[]})[]};
interface OperationContext {diagnostics:Diagnostic[];residuals:[]}
export interface CoreRelationshipDeclaration extends OperationContext {operation:'declare-core-relationship';version:'1.0.0';source:Source;target:Source;identity:RelationshipModuleIdentity;request:CoreRelationshipRequest;provenance:{origin:'authored';idealPath:string;basis:'explicit-author-declaration';nativePath:null}}
export type CoreRelationshipMeaning={state:'missing'}|{state:'known'|'partial';relationships:CoreRelationship[];uninterpretedPaths:string[]};
export interface CoreRelationshipInspection extends OperationContext {operation:'inspect-core-relationships';version:'3.0.0';source:Source;identity:RelationshipModuleIdentity;path:string;meaning:CoreRelationshipMeaning;provenance:'unverified'}
export interface CoreRelationshipLookup extends OperationContext {operation:'lookup-core-relationship';version:'3.0.0';source:Source;identity:CoreRelationshipIdentity;path:string;relationship:CoreRelationship;uninterpretedPaths:string[];provenance:'unverified'}
export type CoreRelationshipOperation=CoreRelationshipDeclaration|CoreRelationshipInspection|CoreRelationshipLookup;
