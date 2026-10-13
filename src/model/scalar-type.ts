/** Internal original 0.7 scalar label owner; no public/native admission claim. */
import sourceSchema from '../../spec/core/relationship-document.schema.json';
import currentSourceSchema from '../../spec/core/schema-properties-document.schema.json';
import currentResultSchema from '../../spec/core/scalar-type-inspection-v0.2.schema.json';
import resultSchema from '../../spec/core/scalar-type-inspection.schema.json';
import {copyJson} from './json';
import {SCALAR_TYPES,UmfError,type Document,type ScalarType} from './types';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
export interface CoreScalarTypeIdentity {module:string;element:string}
export type CoreScalarTypeMeaning={state:'known';scalarType:ScalarType}|{state:'unknown';value:string}|{state:'missing'}|{state:'inapplicable';authoredScalarType?:string};
export interface CoreScalarTypeInspection {operation:'inspect-core-scalar-type';version:'0.1.0'|'0.2.0';source:Document;identity:CoreScalarTypeIdentity;path:string;meaning:CoreScalarTypeMeaning;provenance:'unverified'}
const validator=createValidator();validator.addSchema(sourceSchema);validator.addSchema(currentSourceSchema);const legacyCheck=validator.compile(resultSchema),currentCheck=validator.compile(currentResultSchema);
/** Inspect a value-family label without inferring role, native domain or container item type. */
export function inspectCoreScalarType(input:Document,identityInput:CoreScalarTypeIdentity):CoreScalarTypeInspection {
 const source=copyJson(input) as unknown as Document,identity=copyJson(identityInput) as unknown as CoreScalarTypeIdentity;
 if(!identity||typeof identity!=='object'||Array.isArray(identity)||Object.keys(identity).some(k=>k!=='module'&&k!=='element')||typeof identity.module!=='string'||!identity.module||typeof identity.element!=='string'||!identity.element)throw new UmfError('CORE_SCALAR_TYPE_IDENTITY','Expected explicit module and element identities');
 if(source?.umf!=='0.7.0'&&source?.umf!=='0.8.0')throw new UmfError('CORE_SCALAR_TYPE_VERSION','Only original 0.7 or 0.8 documents are admitted by their versioned inspection profiles');
 const validation=validateDocument(source);if(!validation.valid)throw new UmfError('CORE_SCALAR_TYPE_SOURCE',JSON.stringify(validation.diagnostics));
 const mi=source.modules.findIndex(m=>m.id===identity.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===identity.element)??-1;
 if(mi<0||ei<0)throw new UmfError('CORE_SCALAR_TYPE_MISSING','Element identity is absent');
 const element=source.modules[mi]!.elements[ei]!,present=Object.hasOwn(element,'scalarType'),value=element.scalarType;
 const meaning:CoreScalarTypeMeaning=element.kind!=='field'?{state:'inapplicable',...(present?{authoredScalarType:value}:{} )}:!present?{state:'missing'}:(SCALAR_TYPES as readonly unknown[]).includes(value)?{state:'known',scalarType:value as ScalarType}:{state:'unknown',value:value!};
 const result=copyJson({operation:'inspect-core-scalar-type',version:source.umf==='0.8.0'?'0.2.0':'0.1.0',source,identity,path:`/modules/${mi}/elements/${ei}/scalarType`,meaning,provenance:'unverified'});
 const check=source.umf==='0.8.0'?currentCheck:legacyCheck;
 if(!check(result))throw new UmfError('CORE_SCALAR_TYPE_RESULT',JSON.stringify(check.errors));
 return result as unknown as CoreScalarTypeInspection;
}
