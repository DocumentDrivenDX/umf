// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
import type {FieldTableSpecRequest,FieldTableSpecProjection} from './field-tablespec-projection';
export {default as recordTableSpecProjectionSchema} from '../../spec/core/record-tablespec-projection.schema.json';
export interface RecordTableSpecRequest {id:string;tableName:string;mode:'strict'|'report';fields:{author:CoreKindDeclaration;columnName:string;nativeType:FieldTableSpecRequest['nativeType']}[]}
const binding={id:'umf.core.record.tablespec',version:'1.0.0',nativeVersion:'647e8e566ad78b864282ec65c0b0b2237aa63084',subset:'Authored record with explicit flat field carriers; no value-domain or execution equivalence'} as const;
export interface RecordTableSpecProjection {operation:'project-record-tablespec';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreKindDeclaration;request:RecordTableSpecRequest;binding:typeof binding;target?:Document;mappings:{origin:'authored';kind:'record'|'field';idealPath:string;nativePath:string;outcome:'exact'|'unknown'|'not-expressible'}[];residuals:FieldTableSpecProjection['residuals'];diagnostics:Diagnostic[]}
