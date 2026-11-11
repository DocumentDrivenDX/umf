// SPDX-License-Identifier: MIT OR Apache-2.0
import type {CoreLiteral} from './schema-literals';
import type {Document,Validation} from './types';

export interface CoreRecordValueIdentity {module:string;element:string;}
export type CoreRecordFieldValue={field:CoreRecordValueIdentity;state:'absent'}|{field:CoreRecordValueIdentity;state:'present';value:CoreLiteral};
export interface CoreRecordValueCheck {
 operation:'validate-core-record-values';version:'2.0.0';source:Document;identity:CoreRecordValueIdentity;
 values:CoreRecordFieldValue[];documentValidation:Validation;validation:Validation;
 fields:{field:CoreRecordValueIdentity;state:'absent'|'present';validation:Validation}[];
}
