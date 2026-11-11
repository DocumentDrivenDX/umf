// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreCardinalityDeclaration} from '../model/cardinality';
import schema from '../../spec/core/cardinality-sqlserver-projection.schema.json';
export {default as cardinalitySqlServerProjectionSchema} from '../../spec/core/cardinality-sqlserver-projection.schema.json';
import type {sqlServerCarriers as carriers} from './sqlserver-syntax';
export interface CardinalitySqlServerRequest {id:string;namespace:string;tableName:string;columnName:string;nativeType:keyof typeof carriers;mode:'strict'|'report';storage:'scalar'|'json-array'|'json-object';requireExactValues:boolean}
const binding=schema.properties.binding.const;
export interface CardinalitySqlServerProjection {
 operation:'project-cardinality-sqlserver';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreCardinalityDeclaration;request:CardinalitySqlServerRequest;target?:{format:'sqlserver-ddl';sql:string};nativeSql?:string;diagnostics:Diagnostic[];binding:typeof binding;
 mapping:{origin:'authored';cardinality:'one'|'array'|'map'|'unspecified';encoding:'scalar'|'json-array'|'json-object'|'carrier-only';basis:'Explicit author declaration and selected native carrier; residuals qualify unrepresented obligations';idealPath:string;nativePath:'/sql';outcome:'exact'|'approximated'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'approximated'|'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
