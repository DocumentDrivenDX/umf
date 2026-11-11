// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic,Cardinality} from '../model/types';
import type {NativeJson} from '../model/native-json';
import schema from '../../spec/core/sqlserver-cardinality-classification.schema.json';
import type {SQLSERVER_CARDINALITY_EXTENSION} from './cardinality-sqlserver-package';
export {SQLSERVER_CARDINALITY_EXTENSION,sqlserverCardinalityPackage} from './cardinality-sqlserver-package';
export {default as sqlserverCardinalityClassificationSchema} from '../../spec/core/sqlserver-cardinality-classification.schema.json';
export interface SqlServerCardinalityRequest {column:string;nativeSource:string;mode:'strict'|'report';profile:'native-scalar'|'json-array'|'json-object'|'unresolved';identity:{module:string;element:string};constraint:string|null;}
const binding=schema.properties.binding.const;
const basis='Explicit representation selection and pinned catalog constraint profile; physical column and logical Field remain distinct' as const;
const recovery='Retain original native archive and author assertions; classification does not replace native meaning' as const;
export interface SqlServerCardinalityClassification {
 operation:'classify-sqlserver-cardinality';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:SqlServerCardinalityRequest;binding:typeof binding;
 mapping:{origin:'classified';idealPath:string;nativePath:string;nativeFragment:NativeJson;cardinality:Cardinality;interpretation:'declared'|'unknown'|'unsupported';outcome:'exact'|'approximated'|'unknown'|'not-expressible';basis:typeof basis};
 residuals:{path:string;value:Json;reason:string;recovery:typeof recovery}[];diagnostics:Diagnostic[];
}
