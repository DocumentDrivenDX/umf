// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreCardinalityDeclaration} from '../model/cardinality';
import schema from '../../spec/core/cardinality-tablespec-projection.schema.json';
export {default as cardinalityTableSpecProjectionSchema} from '../../spec/core/cardinality-tablespec-projection.schema.json';
export interface CardinalityTableSpecRequest {id:string;tableName:string;columnName:string;nativeType:'BOOLEAN'|'INTEGER'|'DECIMAL'|'FLOAT'|'TEXT'|'VARCHAR'|'CHAR'|'DATE'|'DATETIME'|'TIMESTAMP'|'EMBEDDING';dimension:number|null;requireExactValues:boolean;profile:'generated-json'|'generated-spark'|'unresolved';mode:'strict'|'report'}
const binding=schema.properties.binding.const;
export interface CardinalityTableSpecProjection {
 operation:'project-cardinality-tablespec';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreCardinalityDeclaration;request:CardinalityTableSpecRequest;target?:Document;binding:typeof binding;diagnostics?:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativePath:'/columns/0';cardinality:'one'|'array'|'map'|'unspecified';encoding:'scalar'|'embedding'|'carrier-only';profile:CardinalityTableSpecRequest['profile'];itemPath:string|null;outcome:'exact'|'approximated'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'approximated'|'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
