// SPDX-License-Identifier: MIT OR Apache-2.0
// Capture complete retained TypeScript success and refusal envelopes.
import {inspectCoreCardinality,declareCoreCardinality,verifyCoreCardinalityDeclaration} from '../../../../../../src/model/cardinality';
import type {Document} from '../../../../../../src/model/types';

const identity={module:'m',element:'e'};
const document:Document={umf:'0.10.0',id:'author',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'',elements:[
 {id:'e',kind:'field',nullability:'required',extensions:{future:{opaque:'retain'}}},
 {id:'v',kind:'field',scalarType:'integer',extensions:{}}]}]} as Document;
const known=structuredClone(document);known.modules[0]!.elements[0]!.cardinality='array';known.modules[0]!.elements[0]!.itemType={module:'m',element:'v',future:{unknown:true}};
const unknown=structuredClone(document);unknown.modules[0]!.elements[0]!.cardinality='future-container';
const surrogate=structuredClone(document);surrogate.modules[0]!.elements[0]!.cardinality='\ud800';
const inapplicable=structuredClone(document);inapplicable.modules[0]!.elements[0]!.kind='record';delete inapplicable.modules[0]!.elements[0]!.nullability;
const request={cardinality:'array' as const,itemType:{module:'m',element:'v',future:{unknown:true}}};
const surrogateItemDocument=structuredClone(document);surrogateItemDocument.modules[0]!.elements[1]!.id='\ud800';
const surrogateItemRequest={cardinality:'array' as const,itemType:{module:'m',element:'\ud800'}};
const surrogateIdentityDocument=structuredClone(document);surrogateIdentityDocument.modules[0]!.id='\ud800';surrogateIdentityDocument.modules[0]!.elements[0]!.id='\ud801';
const surrogateIdentity={module:'\ud800',element:'\ud801'};
const captureError=(f:()=>unknown)=>{try{return {ok:true,value:f()}}catch(e){const x=e as {code?:string;message?:string;path?:string};return {ok:false,error:{code:x.code??'',message:x.message??String(e),path:x.path??''}}}};
const declaration=declareCoreCardinality(document,identity,request);
const surrogateItemDeclaration=captureError(()=>declareCoreCardinality(surrogateItemDocument,identity,surrogateItemRequest));
const malformedSourceReceipt=structuredClone(declaration);malformedSourceReceipt.source={} as Document;
const malformedTargetReceipt=structuredClone(declaration);malformedTargetReceipt.target={} as Document;
const inspections={missing:captureError(()=>inspectCoreCardinality(document,identity)),known:captureError(()=>inspectCoreCardinality(known,identity)),unknown:captureError(()=>inspectCoreCardinality(unknown,identity)),surrogate:captureError(()=>inspectCoreCardinality(surrogate,identity)),inapplicable:captureError(()=>inspectCoreCardinality(inapplicable,identity))};
const refusals={unknownOverwrite:captureError(()=>declareCoreCardinality(unknown,identity,{cardinality:'one'})),invalidRequest:captureError(()=>declareCoreCardinality(document,identity,{cardinality:'array',itemType:{module:'',element:''}} as never)),missingIdentity:captureError(()=>inspectCoreCardinality(document,{module:'absent',element:'absent'})),malformedSourceReceipt:captureError(()=>verifyCoreCardinalityDeclaration(malformedSourceReceipt,declaration.target)),malformedTargetReceipt:captureError(()=>verifyCoreCardinalityDeclaration(malformedTargetReceipt,declaration.target)),surrogateIdentity:captureError(()=>inspectCoreCardinality(surrogateIdentityDocument,surrogateIdentity))};
console.log(JSON.stringify({identity,document,known,unknown,inapplicable,request,inspections,declaration,surrogateItemDocument,surrogateItemRequest,surrogateItemDeclaration,surrogateIdentityDocument,surrogateIdentity,malformedSourceReceipt,malformedTargetReceipt,verified:captureError(()=>verifyCoreCardinalityDeclaration(declaration,declaration.target)),refusals},null,2));
