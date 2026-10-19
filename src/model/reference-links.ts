// SPDX-License-Identifier: MIT OR Apache-2.0
import {CURRENT_CORE_VERSION} from '../generated/core-model';
import {snapshotSchema} from '../validation/internal-schema';
import currentCore from '../../spec/core/schema.json';
import inspectionSchema from '../../spec/core/reference-links-inspection-v0.3.schema.json';
/** Current reference-link inspection; no bare role gains type authority. */
import {copyJson} from './json';
import {UmfError,type Document,type Element} from './types';
import {validateDocument} from '../validation/document';
import {createValidator} from '../validation/schema';
export interface CoreReferenceLinkIdentity {module:string;element:string}
export interface CoreReferenceLink {index:number;path:string;reference:NonNullable<Element['references']>[number];target:{identity:CoreReferenceLinkIdentity;path:string;kind?:string};uninterpretedPaths:string[];typeAssertion:'unverified'}
export interface CoreReferenceLinksInspection {operation:'inspect-core-reference-links';version:'0.3.0';source:Document;identity:CoreReferenceLinkIdentity;path:string;meaning:{state:'missing'}|{state:'present';links:CoreReferenceLink[]};provenance:'unverified'}
const validator=createValidator();validator.addSchema(snapshotSchema(currentCore));const checkInspection=validator.compile(snapshotSchema(inspectionSchema));
/** Resolve only direct core links, preserving order, repetition, roles and opaque qualifiers.
 * CONTRACT-040 requires separate verified receipts for authored record-type assertions. */
export function inspectCoreReferenceLinks(input:Document,identityInput:CoreReferenceLinkIdentity):CoreReferenceLinksInspection {
 const source=copyJson(input) as unknown as Document,identity=copyJson(identityInput) as unknown as CoreReferenceLinkIdentity;
 if(!identity||typeof identity!=='object'||Array.isArray(identity)||Object.keys(identity).some(k=>k!=='module'&&k!=='element')||typeof identity.module!=='string'||!identity.module||typeof identity.element!=='string'||!identity.element)throw new UmfError('CORE_REFERENCE_LINKS_IDENTITY','Expected explicit qualified identity');
 if(source?.umf!==CURRENT_CORE_VERSION)throw new UmfError('CORE_REFERENCE_LINKS_VERSION','Current core 0.10.0 document required');
 const validation=validateDocument(source);if(!validation.valid)throw new UmfError('CORE_REFERENCE_LINKS_SOURCE',JSON.stringify(validation.diagnostics));
 const mi=source.modules.findIndex(m=>m.id===identity.module),ei=source.modules[mi]?.elements.findIndex(e=>e.id===identity.element)??-1;
 if(mi<0||ei<0)throw new UmfError('CORE_REFERENCE_LINKS_MISSING','Element identity is absent');
 const element=source.modules[mi]!.elements[ei]!,path=`/modules/${mi}/elements/${ei}/references`;
 const meaning:CoreReferenceLinksInspection['meaning']=!Object.hasOwn(element,'references')?{state:'missing'}:{state:'present',links:element.references!.map((reference,index)=>{
  const ti=source.modules.findIndex(m=>m.id===reference.module),te=source.modules[ti]!.elements.findIndex(e=>e.id===reference.element),target=source.modules[ti]!.elements[te]!,at=path+'/'+index;
  return {index,path:at,reference,target:{identity:{module:reference.module,element:reference.element},path:`/modules/${ti}/elements/${te}`,...(Object.hasOwn(target,'kind')?{kind:target.kind as string}:{})},uninterpretedPaths:validation.diagnostics.filter(d=>d.severity==='warning'&&d.code==='UNKNOWN_CORE_FIELD'&&(d.path===at||d.path.startsWith(at+'/'))).map(d=>d.path),typeAssertion:'unverified'};
 })};
 const result=copyJson({operation:'inspect-core-reference-links',version:'0.3.0',source,identity,path,meaning,provenance:'unverified'});
 const check=checkInspection;
 if(!check(result))throw new UmfError('CORE_REFERENCE_LINKS_RESULT',JSON.stringify(check.errors));
 return result as unknown as CoreReferenceLinksInspection;
}
