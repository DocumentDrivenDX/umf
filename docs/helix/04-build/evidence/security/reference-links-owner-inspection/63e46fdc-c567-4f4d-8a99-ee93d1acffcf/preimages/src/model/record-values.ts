import {evaluateRecordBody} from './internal/record-body';
import {copyJson} from './json';
import {UmfError,pointer,type Document,type Validation,type Diagnostic} from './types';
import {type CoreLiteral,knownSchemaMembers} from './schema-literals';
import {validateDocument} from '../validation/document';
import {validateCoreFieldValue} from './schema-properties';
export interface CoreRecordValueIdentity {module:string;element:string;}
export type CoreRecordFieldValue={field:CoreRecordValueIdentity;state:'absent'}|{field:CoreRecordValueIdentity;state:'present';value:CoreLiteral};
export interface CoreRecordValueCheck {
 operation:'validate-core-record-values';version:'1.0.0';source:Document;identity:CoreRecordValueIdentity;
 values:CoreRecordFieldValue[];documentValidation:Validation;validation:Validation;
 fields:{field:CoreRecordValueIdentity;state:'absent'|'present';validation:Validation}[];
}
/** Logical membership/presence/field checks, never native rows, defaults or dataset uniqueness. */
export function validateCoreRecordValues(input:Document,identityInput:CoreRecordValueIdentity,valuesInput:CoreRecordFieldValue[]):CoreRecordValueCheck {
 const source=copyJson(input) as unknown as Document,identity=copyJson(identityInput) as unknown as CoreRecordValueIdentity;
 const values=copyJson(valuesInput) as unknown as CoreRecordFieldValue[];
 const documentValidation=validateDocument(source);
 if(source.umf!=='0.8.0'||!documentValidation.valid)throw new UmfError('CORE_RECORD_VALUE_SOURCE','Valid core 0.8.0 source required');
 const body=evaluateRecordBody(source,identity,values,documentValidation,(field,value)=>validateCoreFieldValue(source,field,value));
 return copyJson({operation:body.operation,version:body.version,source,identity,values,documentValidation,validation:body.validation,fields:body.fields}) as unknown as CoreRecordValueCheck;
}
