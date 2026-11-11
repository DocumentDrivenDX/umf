// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreRelationshipDeclaration,CoreRelationshipIdentity} from '../model/relationships';
import type {RelationshipEndpoint} from '../validation/relationships';
import type {AvroRelationshipCarrier} from './relationship-avro-carrier';
export interface RelationshipAvroRequest extends Omit<AvroRelationshipCarrier,'components'> {
 id:string;profile:'target-key-record';relationship:CoreRelationshipIdentity;mode:'strict'|'report';
 components:(AvroRelationshipCarrier['components'][number]&{targetField:RelationshipEndpoint})[];
}
export interface RelationshipAvroProjection {
 operation:'project-relationship-avro';version:'1.0.0';status:'projected'|'blocked';outcome:'approximated'|'not-expressible'|'unknown';
 source:Document;author:CoreRelationshipDeclaration;request:RelationshipAvroRequest;
 binding:{id:'umf.avro.relationships';version:'1.0.0';nativeVersion:'1.12.0';subset:'Explicit single-source/single-target named key-record value carrier, tested with Apache Avro 1.12.0 and fastavro 1.12.2; no target existence, participation, lifecycle or authored intent inferred from native import'};
 target?:Document;nativeArchive?:{schema:string;dependencies:[]};
 mappings:{idealPath:string;nativePath:string;outcome:'approximated';targetKey:string;componentPaths:string[]}[];
 residuals:{path:string;value:Json;outcome:'unknown'|'not-expressible'|'approximated';reason:string;recovery:'Retained receipt recovers authored source and emitted native archive; native-only import does not establish authored intent'}[];
 diagnostics:Diagnostic[];
}
