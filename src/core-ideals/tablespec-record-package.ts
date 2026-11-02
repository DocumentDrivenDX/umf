// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreKindDeclaration} from '../model/field-kind';
import type {Diagnostic,Document,Json} from '../model/types';

export {default as tableSpecRecordClassificationSchema} from '../../spec/core/tablespec-record-classification.schema.json';
export interface TableSpecRecordRequest {recordModule:string;recordId:string;mode:'strict'|'report';authors?:CoreKindDeclaration[]}
const binding={id:'umf.tablespec.record',version:'1.0.0',nativeVersion:'647e8e566ad78b864282ec65c0b0b2237aa63084',subset:'Captured table defines named column members; contextual groups and execution remain native'} as const;
export type TableSpecRecordMapping={origin:'classified';kind:'field'|'record';idealPath:string;nativePath:string;nativeFragment:Json;basis:'checked-native-column-membership'|'checked-native-table-members';outcome:'exact'|'unknown'};
export interface TableSpecRecordClassification {
 operation:'classify-tablespec-record';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:TableSpecRecordRequest;binding:typeof binding;mappings:TableSpecRecordMapping[];
 residuals:{path:string;value:Json;reason:string;recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'}[];diagnostics:Diagnostic[];
}
