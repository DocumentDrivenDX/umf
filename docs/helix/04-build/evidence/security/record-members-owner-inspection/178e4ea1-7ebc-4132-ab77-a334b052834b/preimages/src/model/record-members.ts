/** Internal original 0.7 membership owner; no native or author authority. */
import sourceSchema from '../../spec/core/relationship-document.schema.json';
import resultSchema from '../../spec/core/record-members-inspection.schema.json';
import {copyJson} from './json';
import {UmfError,type Document} from './types';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
import type {CoreKeyFieldReference} from '../validation/keys';
export interface CoreRecordMembersIdentity {module:string;element:string}
export type CoreRecordMembersMeaning={state:'known'|'partial';members:CoreKeyFieldReference[];uninterpretedPaths:string[]}|{state:'missing'|'inapplicable'};
export interface CoreRecordMembersInspection {operation:'inspect-core-record-members';version:'0.1.0';source:Document;identity:CoreRecordMembersIdentity;path:string;meaning:CoreRecordMembersMeaning;provenance:'unverified'}
const validator=createValidator();validator.addSchema(sourceSchema);const check=validator.compile(resultSchema);
/** Explicit empty membership differs from an absent declaration. Qualifiers stay opaque. */
export function inspectCoreRecordMembers(input:Document,identityInput:CoreRecordMembersIdentity):CoreRecordMembersInspection {
 const source=copyJson(input) as unknown as Document,identity=copyJson(identityInput) as unknown as CoreRecordMembersIdentity;
 if(!identity||typeof identity!=='object'||Array.isArray(identity)||Object.keys(identity).some(k=>k!=='module'&&k!=='element')||typeof identity.module!=='string'||!identity.module||typeof identity.element!=='string'||!identity.element)throw new UmfError('CORE_RECORD_MEMBERS_IDENTITY','Expected explicit module and element identities');
 if(source?.umf!=='0.7.0')throw new UmfError('CORE_RECORD_MEMBERS_VERSION','Only original 0.7 documents are admitted');
 const validation=validateDocument(source);if(!validation.valid)throw new UmfError('CORE_RECORD_MEMBERS_SOURCE',JSON.stringify(validation.diagnostics));
 const mi=source.modules.findIndex(m=>m.id===identity.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===identity.element)??-1;
 if(mi<0||ei<0)throw new UmfError('CORE_RECORD_MEMBERS_MISSING','Element identity is absent');
 const element=source.modules[mi]!.elements[ei]!,path=`/modules/${mi}/elements/${ei}/members`;
 const uninterpretedPaths=validation.diagnostics.filter(d=>d.severity==='warning'&&d.code==='UNKNOWN_KEY_QUALIFIER'&&(d.path===path||d.path.startsWith(path+'/'))).map(d=>d.path);
 const meaning:CoreRecordMembersMeaning=element.kind!=='record'?{state:'inapplicable'}:!Object.hasOwn(element,'members')?{state:'missing'}:{state:uninterpretedPaths.length?'partial':'known',members:element.members as CoreKeyFieldReference[],uninterpretedPaths};
 const result=copyJson({operation:'inspect-core-record-members',version:'0.1.0',source,identity,path,meaning,provenance:'unverified'});
 if(!check(result))throw new UmfError('CORE_RECORD_MEMBERS_RESULT',JSON.stringify(check.errors));
 return result as unknown as CoreRecordMembersInspection;
}
