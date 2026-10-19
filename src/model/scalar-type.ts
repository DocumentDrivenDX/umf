import {CURRENT_CORE_VERSION} from '../generated/core-model';
import {snapshotSchema} from '../validation/internal-schema';
import currentCore from '../../spec/core/schema.json';
import inspectionSchema from '../../spec/core/scalar-type-inspection-v0.3.schema.json';
/** Current scalar label inspection; no native-domain equivalence claim. */
import {copyJson} from './json';
import {scalarTypesForVersion,UmfError,type Document,type ScalarType} from './types';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
export interface CoreScalarTypeIdentity {module:string;element:string}
export type CoreScalarTypeMeaning={state:'known';scalarType:ScalarType}|{state:'unknown';value:string}|{state:'missing'}|{state:'inapplicable';authoredScalarType?:string};
export interface CoreScalarTypeInspection {operation:'inspect-core-scalar-type';version:'0.3.0';source:Document;identity:CoreScalarTypeIdentity;path:string;meaning:CoreScalarTypeMeaning;provenance:'unverified'}
const validator=createValidator();validator.addSchema(snapshotSchema(currentCore));const checkInspection=validator.compile(snapshotSchema(inspectionSchema));
/** Inspect a value-family label without inferring role, native domain or container item type. */
export function inspectCoreScalarType(input:Document,identityInput:CoreScalarTypeIdentity):CoreScalarTypeInspection {
 const source=copyJson(input) as unknown as Document,identity=copyJson(identityInput) as unknown as CoreScalarTypeIdentity;
 if(!identity||typeof identity!=='object'||Array.isArray(identity)||Object.keys(identity).some(k=>k!=='module'&&k!=='element')||typeof identity.module!=='string'||!identity.module||typeof identity.element!=='string'||!identity.element)throw new UmfError('CORE_SCALAR_TYPE_IDENTITY','Expected explicit module and element identities');
 if(source?.umf!==CURRENT_CORE_VERSION)throw new UmfError('CORE_SCALAR_TYPE_VERSION','Current core 0.10.0 document required');
 const validation=validateDocument(source);if(!validation.valid)throw new UmfError('CORE_SCALAR_TYPE_SOURCE',JSON.stringify(validation.diagnostics));
 const mi=source.modules.findIndex(m=>m.id===identity.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===identity.element)??-1;
 if(mi<0||ei<0)throw new UmfError('CORE_SCALAR_TYPE_MISSING','Element identity is absent');
 const element=source.modules[mi]!.elements[ei]!,present=Object.hasOwn(element,'scalarType'),value=element.scalarType;
 const meaning:CoreScalarTypeMeaning=element.kind!=='field'?{state:'inapplicable',...(present?{authoredScalarType:value}:{} )}:!present?{state:'missing'}:(scalarTypesForVersion(source.umf) as readonly unknown[]).includes(value)?{state:'known',scalarType:value as ScalarType}:{state:'unknown',value:value!};
 const result=copyJson({operation:'inspect-core-scalar-type',version:'0.3.0',source,identity,path:`/modules/${mi}/elements/${ei}/scalarType`,meaning,provenance:'unverified'});
 const check=checkInspection;
 if(!check(result))throw new UmfError('CORE_SCALAR_TYPE_RESULT',JSON.stringify(check.errors));
 return result as unknown as CoreScalarTypeInspection;
}
