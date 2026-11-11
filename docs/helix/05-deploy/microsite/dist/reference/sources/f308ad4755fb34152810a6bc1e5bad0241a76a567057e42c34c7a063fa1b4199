// SPDX-License-Identifier: MIT OR Apache-2.0
import type {Document,Json,Diagnostic} from '../model/types';
import type {CoreKindDeclaration} from '../model/field-kind';
import type {ParquetFieldClassification} from './parquet-field';
export {default as parquetRecordClassificationSchema} from '../../spec/core/parquet-record-classification.schema.json';
export interface ParquetRecordRequest {recordModule:string;recordId:string;index:number;mode:'strict'|'report';authors?:CoreKindDeclaration[]}
const binding={id:'umf.parquet.record',version:'1.0.0',nativeVersion:'parquet-format@219e3f12a62f9476e830c21e26d030d231f7c017',subset:'Unannotated root/struct definitions after LIST/MAP interpretation; direct members only, no cardinality or value-domain equivalence'} as const;
type Mapping=Omit<ParquetFieldClassification['mapping'],'kind'|'basis'>&{kind:'field'|'record';basis:'checked-record-field-membership'|'checked-record-declaration'};
export interface ParquetRecordClassification {
 operation:'classify-parquet-record';version:'1.0.0';status:'classified'|'blocked';source:Document;target?:Document;request:ParquetRecordRequest;binding:typeof binding;mappings:Mapping[];
 residuals:{path:string;value:Json;reason:string;recovery:'Source and native fragments retained; resolve conflict then recompute whole record classification'}[];diagnostics:Diagnostic[];
}
