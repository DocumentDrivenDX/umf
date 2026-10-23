// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze the prior TypeScript's complete result envelopes before Rust parity work.
import {mkdir,writeFile} from 'node:fs/promises';
import {inspectCoreElementKind,declareCoreElementKind,verifyCoreKindDeclaration} from '../../../../src/model/field-kind';
import {inspectCoreNullability,declareCoreNullability,verifyCoreNullabilityDeclaration} from '../../../../src/model/nullability';
import type {Document} from '../../../../src/model/types';
const source:Document={umf:'0.10.0',id:'r5-kind-nullability',vocabularies:{future:{version:'1.0.0'}},modules:[{id:'m',namespace:'',elements:[
 {id:'known',kind:'field',nullability:'required',extensions:{future:{opaque:[1,{retain:true}]}}},
 {id:'missing',kind:'field',extensions:{}},
 {id:'kindless',extensions:{}},
 {id:'record',kind:'record',extensions:{}},
]}]};
const surrogateSource=structuredClone(source);surrogateSource.modules[0]!.id='\ud800';surrogateSource.modules[0]!.elements[0]!.id='\ud800';
const captureError=(f:()=>unknown)=>{try{return {ok:true,value:f()}}catch(e){const x=e as {code?:string;message?:string;path?:string};return {ok:false,error:{code:x.code??'',message:x.message??String(e),path:x.path??''}}}};
const cases={
 kind_inspect_known:inspectCoreElementKind(source,{module:'m',element:'known'}),
 kind_inspect_unspecified:inspectCoreElementKind(source,{module:'m',element:'kindless'}),
 kind_declare:declareCoreElementKind(source,{module:'m',element:'missing'},'field'),
 kind_verify:verifyCoreKindDeclaration(declareCoreElementKind(source,{module:'m',element:'missing'},'field'),declareCoreElementKind(source,{module:'m',element:'missing'},'field').target),
 nullability_inspect_missing:inspectCoreNullability(source,{module:'m',element:'missing'}),
 nullability_inspect_known:inspectCoreNullability(source,{module:'m',element:'known'}),
 nullability_inspect_inapplicable:inspectCoreNullability(source,{module:'m',element:'record'}),
 nullability_declare:declareCoreNullability(source,{module:'m',element:'missing'},'absent-allowed'),
 nullability_verify:verifyCoreNullabilityDeclaration(declareCoreNullability(source,{module:'m',element:'missing'},'absent-allowed'),declareCoreNullability(source,{module:'m',element:'missing'},'absent-allowed').target),
 kind_surrogate_identity_inspect:inspectCoreElementKind(surrogateSource,{module:'\ud800',element:'\ud800'}),
 nullability_surrogate_identity_inspect:inspectCoreNullability(surrogateSource,{module:'\ud800',element:'\ud800'}),
};
const invalid=structuredClone(source);invalid.modules[0]!.elements[0]!.id='';invalid.modules.push(structuredClone(invalid.modules[0]!));
const conflicting=structuredClone(source);conflicting.modules[0]!.elements[0]!.scalarType='integer';
const kindReceipt=declareCoreElementKind(source,{module:'m',element:'missing'},'field');
const nullReceipt=declareCoreNullability(source,{module:'m',element:'missing'},'required');
const forgedKind=structuredClone(kindReceipt) as unknown as Record<string,unknown>;delete forgedKind.identity;
const forgedNull=structuredClone(nullReceipt) as unknown as Record<string,unknown>;delete forgedNull.identity;
const invalidKindSource=structuredClone(kindReceipt);invalidKindSource.source={} as never;
const invalidKindTarget=structuredClone(kindReceipt);invalidKindTarget.target={} as never;
const invalidNullSource=structuredClone(nullReceipt);invalidNullSource.source={} as never;
const invalidNullTarget=structuredClone(nullReceipt);invalidNullTarget.target={} as never;
const staleKind=structuredClone(kindReceipt);staleKind.target.id='stale';
const staleNull=structuredClone(nullReceipt);staleNull.target.id='stale';
const refusals={
 sourceInvalidKind:captureError(()=>inspectCoreElementKind(invalid,{module:'m',element:'known'})),
 sourceInvalidNullability:captureError(()=>inspectCoreNullability(invalid,{module:'m',element:'known'})),
 kindConflict:captureError(()=>declareCoreElementKind(conflicting,{module:'m',element:'known'},'record')),
 malformedKindReceipt:captureError(()=>verifyCoreKindDeclaration(forgedKind as never,kindReceipt.target)),
 malformedNullabilityReceipt:captureError(()=>verifyCoreNullabilityDeclaration(forgedNull as never,nullReceipt.target)),
 invalidKindReceiptSource:captureError(()=>verifyCoreKindDeclaration(invalidKindSource,kindReceipt.target)),
 invalidKindReceiptTarget:captureError(()=>verifyCoreKindDeclaration(invalidKindTarget,kindReceipt.target)),
 invalidNullabilityReceiptSource:captureError(()=>verifyCoreNullabilityDeclaration(invalidNullSource,nullReceipt.target)),
 invalidNullabilityReceiptTarget:captureError(()=>verifyCoreNullabilityDeclaration(invalidNullTarget,nullReceipt.target)),
 staleKindReceipt:captureError(()=>verifyCoreKindDeclaration(kindReceipt,staleKind.target)),
 staleNullabilityReceipt:captureError(()=>verifyCoreNullabilityDeclaration(nullReceipt,staleNull.target)),
 nullabilityRole:captureError(()=>declareCoreNullability(source,{module:'m',element:'record'},'required')),
 missingIdentity:captureError(()=>inspectCoreElementKind(source,{module:'absent',element:'absent'})),
};
const root=new URL('./',import.meta.url);await mkdir(root,{recursive:true});
await writeFile(new URL('input.json',root),JSON.stringify(source,null,2)+'\n');
await writeFile(new URL('surrogate-input.json',root),JSON.stringify(surrogateSource,null,2)+'\n');
await writeFile(new URL('frozen-typescript.json',root),JSON.stringify(cases,null,2)+'\n');
await writeFile(new URL('frozen-refusals.json',root),JSON.stringify(refusals,null,2)+'\n');
