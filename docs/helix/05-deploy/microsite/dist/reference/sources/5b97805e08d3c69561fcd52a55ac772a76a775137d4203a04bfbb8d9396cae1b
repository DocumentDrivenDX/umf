// SPDX-License-Identifier: MIT OR Apache-2.0
import type {avroCarriers} from './avro-carriers';
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
export {default as fieldAvroProjectionSchema} from '../../spec/core/field-avro-projection.schema.json';
export interface FieldAvroRequest {id:string;recordName:string;namespace:string;fieldName:string;nativeType:keyof typeof avroCarriers;mode:'strict'|'report'}
const binding={id:'umf.core.field.avro',version:'1.0.0',nativeVersion:'1.12.0',subset:'Single authored Field with explicit primitive/logical carrier in a record; no presence, execution or value-domain equivalence'} as const;
export interface FieldAvroProjection {
 operation:'project-field-avro';version:'1.0.0';status:'projected'|'blocked';source:Document;author:CoreKindDeclaration;request:FieldAvroRequest;target?:Document;binding:typeof binding;diagnostics:Diagnostic[];
 mapping:{origin:'authored';idealPath:string;nativePath:'/fields/0';outcome:'exact'|'unknown'|'not-expressible'};
 residuals:{path:string;value:Json;reason:string;outcome:'unknown'|'not-expressible';recovery:'Recover source meaning with retained projection receipt; native-only import does not recover author intent'}[];
}
