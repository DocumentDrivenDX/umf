// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreRelationshipDeclaration,CoreRelationshipIdentity} from '../model/relationships';

export interface RelationshipTableSpecRequest {profile:'outgoing-metadata';relationship:CoreRelationshipIdentity;mode:'strict'|'report';columns:{sourceColumn:string;targetField:{module:string;element:string};targetColumn:string}[]}
export interface RelationshipTableSpecProjection {
 operation:'project-relationship-tablespec';version:'1.0.0';status:'projected'|'blocked';outcome:'approximated'|'not-expressible'|'unknown';
 source:Document;author:CoreRelationshipDeclaration;nativeSource:Document;nativeTarget:Document;request:RelationshipTableSpecRequest;binding:{id:'umf.tablespec.relationships';version:'1.0.0';nativeVersion:'647e8e566ad78b864282ec65c0b0b2237aa63084';subset:'Explicit single-source/single-target outgoing metadata with ordered target-Key column pairs; no referential enforcement, lifecycle or authored intent inferred from native import'};target?:Document;
 mappings:{idealPath:string;nativePath:string;outcome:'approximated';sourceColumns:string[];targetColumns:string[];targetKey:string}[];
 residuals:{path:string;value:Json;outcome:'unknown'|'not-expressible'|'approximated';reason:string;recovery:'Retained receipt recovers authored meaning and original native sources; native-only import does not establish authored intent'}[];diagnostics:Diagnostic[];
}
