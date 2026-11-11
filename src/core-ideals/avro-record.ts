// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
import type {AvroFieldClassification} from './avro-field';
import type schema from '../../spec/core/avro-record-classification.schema.json';
export {default as avroRecordClassificationSchema} from '../../spec/core/avro-record-classification.schema.json';
export interface AvroRecordRequest {recordModule:string;recordId:string;mode:'strict'|'report';nativeSource:string;path:string;dependencyId?:string;dependencies?:{id:string;schema:string}[];authors?:CoreKindDeclaration[]}
const binding={id:'umf.avro.record',version:'1.0.0',nativeVersion:'1.12.0',subset:'Declared record/error with ordered fields and dependency-qualified identity; no value-domain or logical-type equivalence'} as const;
type Mapping=Omit<AvroFieldClassification['mapping'],'kind'|'basis'>&{kind:'field'|'record';basis:'checked-record-field-membership'|'checked-record-declaration'};
export interface AvroRecordClassification {
 operation:'classify-avro-record';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:AvroRecordRequest;binding:typeof binding;mappings:Mapping[];
 residuals:{path:string;value:Json;reason:string;recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'}[];diagnostics:Diagnostic[];
}
