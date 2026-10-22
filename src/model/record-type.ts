// SPDX-License-Identifier: MIT OR Apache-2.0
import coreSchema from '../../spec/core/schema.json';
import kindSchema from '../../spec/core/kind-operation-v6.schema.json';
import schemaV6 from '../../spec/core/record-type-operation-v6.schema.json';
export {default as coreRecordTypeOperationV6Schema,default as coreRecordTypeOperationSchema} from '../../spec/core/record-type-operation-v6.schema.json';
import {copyJson} from './json';
import {UmfError,type Document,type Json} from './types';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from './field-kind';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
export interface CoreRecordTypeDeclaration {
 operation:'declare-core-record-type';version:'6.0.0';source:Document;target:Document;fieldAuthor:CoreKindDeclaration;recordAuthor:CoreKindDeclaration;
 reference:{role:'record-type';module:string;element:string};
 provenance:{origin:'authored';idealPath:string;recordPath:string;nativePath:null;basis:'explicit-record-type-declaration';binding:{id:'umf.core.record-type.authoring';version:'6.0.0'}};
}
const validator=createValidator();validator.addSchema(coreSchema);validator.addSchema(kindSchema);const checkV6=validator.compile(schemaV6);
const refuse=validator.compile(false);
const checker=(version:unknown)=>version==='6.0.0'?checkV6:refuse;
/** Explicit type relationship. Generic role strings are never treated as author receipts. */
export function declareCoreRecordType(fieldInput:CoreKindDeclaration,recordInput:CoreKindDeclaration):CoreRecordTypeDeclaration {
 const copiedField=copyJson(fieldInput) as unknown as CoreKindDeclaration,copiedRecord=copyJson(recordInput) as unknown as CoreKindDeclaration;
 const fieldAuthor=verifyCoreKindDeclaration(copiedField,copiedField.target),source=copyJson(fieldAuthor.target) as unknown as Document,recordAuthor=verifyCoreKindDeclaration(copiedRecord,source);
 if(fieldAuthor.provenance.kind!=='field'||recordAuthor.provenance.kind!=='record')throw new UmfError('CORE_RECORD_TYPE_KIND','Expected authored Field and record definition');
 const mi=source.modules.findIndex(m=>m.id===fieldAuthor.identity.module),ei=source.modules[mi]!.elements.findIndex(e=>e.id===fieldAuthor.identity.element),field=source.modules[mi]!.elements[ei]!;
 if(Object.hasOwn(field,'facets'))throw new UmfError('CORE_RECORD_TYPE_FACETS','A faceted value Field cannot also assert a record type');
 if(field.scalarType!==undefined)throw new UmfError('CORE_RECORD_TYPE_SCALAR','Scalar family cannot also assert a record type');
 if(field.references?.some(r=>r.role==='record-type'))throw new UmfError('CORE_RECORD_TYPE_EXISTING','Existing record-type reference requires separate provenance reconciliation');
 if(field.cardinality!==undefined&&!['one','unspecified'].includes(field.cardinality as string))throw new UmfError('CORE_RECORD_TYPE_CARDINALITY','Direct record type requires non-container meaning; declare the item/value Field record type separately');
 const reference={role:'record-type' as const,...recordAuthor.identity},target=copyJson(source) as unknown as Document;
 const selected=target.modules[mi]!.elements[ei]!;selected.references=[...(selected.references??[]),reference];
 const validation=validateDocument(target);if(!validation.valid)throw new UmfError('CORE_RECORD_TYPE_TARGET',JSON.stringify(validation.diagnostics));
 const version='6.0.0';
 const result:CoreRecordTypeDeclaration={operation:'declare-core-record-type',version,source,target,fieldAuthor,recordAuthor,reference,provenance:{origin:'authored',idealPath:`/modules/${mi}/elements/${ei}/references/${selected.references.length-1}`,recordPath:recordAuthor.provenance.idealPath.slice(0,-5),nativePath:null,basis:'explicit-record-type-declaration',binding:{id:'umf.core.record-type.authoring',version}}};
 const output=copyJson(result),check=checker(version);if(!check(output))throw new UmfError('CORE_RECORD_TYPE_RESULT',JSON.stringify(check.errors));return output as unknown as CoreRecordTypeDeclaration;
}
/** Checks consistency and current identity resolution, not cryptographic authorship. */
export function verifyCoreRecordTypeDeclaration(input:CoreRecordTypeDeclaration,current:Document):CoreRecordTypeDeclaration {
 const receipt=copyJson(input) as unknown as CoreRecordTypeDeclaration;if(!checker(receipt?.version)(receipt))throw new UmfError('CORE_RECORD_TYPE_RECEIPT','Malformed record-type declaration');
 const expected=declareCoreRecordType(receipt.fieldAuthor,receipt.recordAuthor);
 const canonical=(value:Json):string=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value!==null&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key]!)).join(',')+'}':JSON.stringify(value);
 if(canonical(copyJson(receipt))!==canonical(copyJson(expected)))throw new UmfError('CORE_RECORD_TYPE_RECEIPT','Receipt differs from recomputed declaration');
 if(canonical(copyJson(current))!==canonical(copyJson(receipt.target)))throw new UmfError('CORE_RECORD_TYPE_STALE','Document changed after type declaration');return receipt;
}
