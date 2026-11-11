// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
export {default as fieldTableSpecProjectionSchema} from '../../spec/core/field-tablespec-projection.schema.json';
export interface FieldTableSpecRequest {id:string;tableName:string;columnName:string;nativeType:'BOOLEAN'|'INTEGER'|'DECIMAL'|'FLOAT'|'TEXT'|'VARCHAR'|'CHAR'|'DATE'|'DATETIME'|'TIMESTAMP';mode:'strict'|'report'}
const binding={id:'umf.core.field.tablespec',version:'1.0.0',nativeVersion:'647e8e566ad78b864282ec65c0b0b2237aa63084',subset:'Single authored named Field; explicit native type; no execution or value-domain equivalence'} as const;
export interface FieldTableSpecProjection {
 operation:'project-field-tablespec';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreKindDeclaration;request:FieldTableSpecRequest;target?:Document;binding:typeof binding;diagnostics?:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativePath:'/columns/0';outcome:'exact'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
