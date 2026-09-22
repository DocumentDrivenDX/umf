import kindsV4 from '../../spec/core/kind-operation-v4.schema.json';
import facets from '../../spec/core/facet-document.schema.json';
import schemaV4 from '../../spec/core/record-type-operation-v4.schema.json';
export {default as coreRecordTypeOperationV4Schema} from '../../spec/core/record-type-operation-v4.schema.json';
import {copyJson} from './json';
import {UmfError,type Document,type Json} from './types';
import {verifyCoreKindDeclaration,type CoreKindDeclaration} from './field-kind';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import legacy from '../../spec/core/schema.json';import fields from '../../spec/core/field-document.schema.json';import kinds from '../../spec/core/kind-operation.schema.json';import schema from '../../spec/core/record-type-operation.schema.json';
import availability from '../../spec/core/nullability-document.schema.json';
import kindsV2 from '../../spec/core/kind-operation-v2.schema.json';
import schemaV2 from '../../spec/core/record-type-operation-v2.schema.json';
import containers from '../../spec/core/cardinality-document.schema.json';
import kindsV3 from '../../spec/core/kind-operation-v3.schema.json';
import schemaV3 from '../../spec/core/record-type-operation-v3.schema.json';
export {default as coreRecordTypeOperationV3Schema} from '../../spec/core/record-type-operation-v3.schema.json';
export {default as coreRecordTypeOperationV2Schema} from '../../spec/core/record-type-operation-v2.schema.json';
export {default as coreRecordTypeOperationSchema} from '../../spec/core/record-type-operation.schema.json';
export interface CoreRecordTypeDeclaration {
 operation:'declare-core-record-type';version:'1.0.0'|'2.0.0'|'3.0.0'|'4.0.0';source:Document;target:Document;fieldAuthor:CoreKindDeclaration;recordAuthor:CoreKindDeclaration;
 reference:{role:'record-type';module:string;element:string};
 provenance:{origin:'authored';idealPath:string;recordPath:string;nativePath:null;basis:'explicit-record-type-declaration';binding:{id:'umf.core.record-type.authoring';version:'1.0.0'|'2.0.0'|'3.0.0'|'4.0.0'}};
}
const validator=createValidator();validator.addSchema(legacy);validator.addSchema(fields);validator.addSchema(kinds);validator.addSchema(availability);validator.addSchema(kindsV2);validator.addSchema(containers);validator.addSchema(facets);validator.addSchema(kindsV3);validator.addSchema(kindsV4);const checkV1=validator.compile(schema),checkV2=validator.compile(schemaV2),checkV3=validator.compile(schemaV3),checkV4=validator.compile(schemaV4);
const checker=(version:unknown)=>version==='4.0.0'?checkV4:version==='3.0.0'?checkV3:version==='2.0.0'?checkV2:checkV1;
/** Explicit type relationship. Generic role strings are never treated as author receipts. */
export function declareCoreRecordType(fieldInput:CoreKindDeclaration,recordInput:CoreKindDeclaration):CoreRecordTypeDeclaration {
 const copiedField=copyJson(fieldInput) as unknown as CoreKindDeclaration,copiedRecord=copyJson(recordInput) as unknown as CoreKindDeclaration;
 const fieldAuthor=verifyCoreKindDeclaration(copiedField,copiedField.target),source=copyJson(fieldAuthor.target) as unknown as Document,recordAuthor=verifyCoreKindDeclaration(copiedRecord,source);
 if(fieldAuthor.provenance.kind!=='field'||recordAuthor.provenance.kind!=='record')throw new UmfError('CORE_RECORD_TYPE_KIND','Expected authored Field and record definition');
 const mi=source.modules.findIndex(m=>m.id===fieldAuthor.identity.module),ei=source.modules[mi]!.elements.findIndex(e=>e.id===fieldAuthor.identity.element),field=source.modules[mi]!.elements[ei]!;
 if(source.umf==='0.5.0'&&Object.hasOwn(field,'facets'))throw new UmfError('CORE_RECORD_TYPE_FACETS','A faceted value Field cannot also assert a record type');
 if(field.scalarType!==undefined)throw new UmfError('CORE_RECORD_TYPE_SCALAR','Scalar family cannot also assert a record type');
 if(field.references?.some(r=>r.role==='record-type'))throw new UmfError('CORE_RECORD_TYPE_EXISTING','Existing record-type reference requires separate provenance reconciliation');
 if((source.umf==='0.4.0'||source.umf==='0.5.0')&&field.cardinality!==undefined&&!['one','unspecified'].includes(field.cardinality as string))throw new UmfError('CORE_RECORD_TYPE_CARDINALITY','Direct record type requires non-container meaning; declare the item/value Field record type separately');
 const reference={role:'record-type' as const,...recordAuthor.identity},target=copyJson(source) as unknown as Document;
 const selected=target.modules[mi]!.elements[ei]!;selected.references=[...(selected.references??[]),reference];
 const validation=validateDocument(target);if(!validation.valid)throw new UmfError('CORE_RECORD_TYPE_TARGET',JSON.stringify(validation.diagnostics));
 const version=source.umf==='0.5.0'?'4.0.0':source.umf==='0.4.0'?'3.0.0':source.umf==='0.3.0'?'2.0.0':'1.0.0';
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
