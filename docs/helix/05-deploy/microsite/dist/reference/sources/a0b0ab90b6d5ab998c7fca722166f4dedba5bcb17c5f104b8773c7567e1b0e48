// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
import type {FieldAvroRequest,FieldAvroProjection} from './field-avro-projection';
export {default as recordAvroProjectionSchema} from '../../spec/core/record-avro-projection.schema.json';
export interface RecordAvroRequest {id:string;recordName:string;namespace:string;mode:'strict'|'report';fields:{author:CoreKindDeclaration;fieldName:string;nativeType:FieldAvroRequest['nativeType']}[]}
const binding={id:'umf.core.record.avro',version:'1.0.0',nativeVersion:'1.12.0',subset:'Authored flat record with explicit primitive/logical field carriers; no presence, execution or value-domain equivalence'} as const;
export interface RecordAvroProjection {operation:'project-record-avro';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreKindDeclaration;request:RecordAvroRequest;binding:typeof binding;target?:Document;mappings:{origin:'authored';kind:'record'|'field';idealPath:string;nativePath:string;outcome:'exact'|'unknown'|'not-expressible'}[];residuals:FieldAvroProjection['residuals'];diagnostics:Diagnostic[]}
