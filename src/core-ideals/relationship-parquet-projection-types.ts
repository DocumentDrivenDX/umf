// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreRelationshipDeclaration,CoreRelationshipIdentity} from '../model/relationships';
import type {RelationshipEndpoint} from '../validation/relationships';
import type {ParquetRelationshipCarrier} from './relationship-parquet-carrier';
export interface RelationshipParquetRequest extends Omit<ParquetRelationshipCarrier,'components'> {
 id:string;profile:'target-key-record';relationship:CoreRelationshipIdentity;mode:'strict'|'report';
 components:(ParquetRelationshipCarrier['components'][number]&{targetField:RelationshipEndpoint})[];
}
export interface RelationshipParquetProjection {
 operation:'project-relationship-parquet';version:'1.0.0';status:'projected'|'blocked';outcome:'approximated'|'not-expressible'|'unknown';
 source:Document;author:CoreRelationshipDeclaration;request:RelationshipParquetRequest;
 binding:{id:'umf.parquet.relationships';version:'1.0.0';nativeVersion:'PyArrow 21.0.0 / Parquet 2.6';subset:'Empty physical nested target-key reference schema with deterministic field IDs; one, optional one or LIST. ASCII common-profile names only; namespace and keyRecordName retained labels. No graph enforcement or native equivalence.'};
 target?:Document;nativeArchive?:{hex:string};
 mappings:{idealPath:string;nativePath:string;outcome:'approximated';targetKey:string;componentPaths:string[]}[];
 residuals:{path:string;value:Json;outcome:'unknown'|'not-expressible'|'approximated';reason:string;recovery:'Retained receipt recovers authored source and emitted native archive; native-only import does not establish authored intent'}[];
 diagnostics:Diagnostic[];
}
