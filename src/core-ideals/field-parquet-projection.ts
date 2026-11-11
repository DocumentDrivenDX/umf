// SPDX-License-Identifier: MIT OR Apache-2.0
import type {parquetCarriers} from './parquet-carriers';
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
export {default as fieldParquetProjectionSchema} from '../../spec/core/field-parquet-projection.schema.json';
export interface FieldParquetRequest {id:string;recordName:string;repetition:'required'|'optional'|'repeated';fieldName:string;nativeType:keyof typeof parquetCarriers;mode:'strict'|'report'}
const binding={id:'umf.core.field.parquet',version:'1.0.0',nativeVersion:'parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017',subset:'Single authored Field, explicit carrier and repetition in an empty schema file; no row writing or value-domain equivalence'} as const;
export interface FieldParquetProjection {
 operation:'project-field-parquet';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreKindDeclaration;request:FieldParquetRequest;target?:Document;binding:typeof binding;diagnostics:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativePath:'/schema/1';outcome:'exact'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
