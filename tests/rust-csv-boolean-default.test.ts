// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createCoreModelEngine} from '../bindings/core/node/index.js';
import {CORE_MODEL_RESOURCES} from '../src/access/core-model-resources';
import {bindCsvBooleanLexicalRust} from '../src/access/rust-csv-boolean-default';
import {readDocument} from '../src/model/document';
import {validateCsvBooleanLexical as referenceValidateCsvBooleanLexical,verifyCsvBooleanLexical as referenceVerifyCsvBooleanLexical} from '../src/model/csv-boolean-lexical';
import type {CsvBooleanLexicalRequest} from '../src/model/csv-boolean-lexical';
import packet from '../scripts/rust-migration/r5/csv-boolean-default-route/predecessor.json';

const source=readDocument(await Bun.file('spec/domain-packs/medical/ontology.json').text(),'json');
const route=bindCsvBooleanLexicalRust(createCoreModelEngine(CORE_MODEL_RESOURCES));
const request=(token:CsvBooleanLexicalRequest['token'],sourceContext:unknown={source:'original.csv',row:1,column:'active',unknown:{retained:['雪',null]}}):CsvBooleanLexicalRequest=>({profile:'umf.csv-boolean-lexical/1.0.0',field:{module:'domain',element:'patients.active'},token,sourceContext:sourceContext as CsvBooleanLexicalRequest['sourceContext']});
const outcome=(run:()=>unknown)=>{try{return {status:'accepted',value:run()};}catch(e){const error=e as Error&{code?:string;path?:string};return {status:'refused',name:error.name,prototype:Object.getPrototypeOf(error)?.constructor?.name??null,code:error.code??null,path:error.path??'',message:error.message};}};
const summary=(receipt:ReturnType<typeof route.validateCsvBooleanLexical>)=>receipt;

test('Node Rust default route matches the frozen TypeScript predecessor outcomes',()=>{
 const cases:any={};
 for(const token of ['true','false','True','False'] as const)cases[`token:${token}`]=summary(route.validateCsvBooleanLexical(source,request(token)));
 const constrained=structuredClone(source);constrained.modules[0]!.elements.find(e=>e.id==='patients.active')!.allowedValues=[{boolean:false}];cases.allowedValueMismatch=summary(route.validateCsvBooleanLexical(constrained,request('True')));
 const unknown=structuredClone(source);(unknown.modules[0]!.elements.find(e=>e.id==='patients.active') as any).facets={futureBooleanRule:{meaning:'unknown'}};cases.unknownSelectedSemantics=summary(route.validateCsvBooleanLexical(unknown,request('true')));
 cases.wrongFieldKind=outcome(()=>route.validateCsvBooleanLexical(source,{...request('true'),field:{module:'domain',element:'patients.birth_date'}} as any));
 const arrayField=structuredClone(source);arrayField.modules[0]!.elements.find(e=>e.id==='patients.active')!.cardinality='array';cases.wrongFieldCardinality=outcome(()=>route.validateCsvBooleanLexical(arrayField,request('true')));
 cases.unsupportedToken=outcome(()=>route.validateCsvBooleanLexical(source,{...request('true'),token:'TRUE'} as any));
 cases.requestShapeBeforeSourceInspection=outcome(()=>route.validateCsvBooleanLexical({} as any,{...request('true'),profile:'future'} as any));
 let reads=0;const guarded=Object.defineProperty({},'umf',{enumerable:true,get(){reads++;return '0.10.0';}});
 cases.invalidReceiptBeforeExpectedInput={result:outcome(()=>route.verifyCsvBooleanLexical({} as any,guarded as any,request('true'))),expectedSourceReads:reads};
 let validReads=0;const validGuarded=Object.defineProperty({},'umf',{enumerable:true,get(){validReads++;return '0.10.0';}});
 cases.validReceiptThenExpectedGetter={result:outcome(()=>route.verifyCsvBooleanLexical(route.validateCsvBooleanLexical(source,request('true')),validGuarded as any,request('true'))),expectedSourceReads:validReads};
 const pairRequest=(context:string)=>({profile:'umf.csv-boolean-lexical/1.0.0',field:{module:'domain',element:'patients.active'},sourceContext:context});
 const base=pairRequest('');const baseBytes=new TextEncoder().encode(JSON.stringify({source,request:base})).length;const exact=pairRequest('x'.repeat(4_000_000-baseBytes));const over=pairRequest(`${exact.sourceContext}x`);
 cases.inputByteLimit={limit:4_000_000,exactPairBytes:new TextEncoder().encode(JSON.stringify({source,request:exact})).length,exact:outcome(()=>route.validateCsvBooleanLexical(source,exact as any)),overPairBytes:new TextEncoder().encode(JSON.stringify({source,request:over})).length,over:outcome(()=>route.validateCsvBooleanLexical(source,over as any))};
 const empty=route.validateCsvBooleanLexical(source,request('true',''));const receiptBytes=new TextEncoder().encode(JSON.stringify(empty)).length;const atReceipt=request('true','x'.repeat(4_000_000-receiptBytes));const overReceipt=request('true',`${atReceipt.sourceContext}x`);
 cases.receiptByteLimit={limit:4_000_000,exactReceiptBytes:new TextEncoder().encode(JSON.stringify(route.validateCsvBooleanLexical(source,atReceipt))).length,exact:outcome(()=>route.validateCsvBooleanLexical(source,atReceipt)),over:outcome(()=>route.validateCsvBooleanLexical(source,overReceipt))};
 expect(cases).toEqual((packet as any).cases);
},60_000);

test('host accessors retain copyJson refusal paths without invoking getters',()=>{
 const cases:{label:string;source:unknown;request:unknown;expectedPath:string}[]=[];
 const sourceId=JSON.parse(JSON.stringify(source));let sourceIdReads=0;
 Object.defineProperty(sourceId,'id',{enumerable:true,configurable:true,get(){sourceIdReads++;return 'hidden';}});
 cases.push({label:'source.id',source:sourceId,request:request('true'),expectedPath:'/id'});
 const nestedSource=JSON.parse(JSON.stringify(source));let nestedReads=0;
 Object.defineProperty(nestedSource.modules[0]!.elements[0] as object,'name',{enumerable:true,configurable:true,get(){nestedReads++;return 'hidden';}});
 cases.push({label:'nested source name',source:nestedSource,request:request('true'),expectedPath:'/modules/0/elements/0/name'});
 const tokenRequest:any=request('true');let tokenReads=0;
 Object.defineProperty(tokenRequest,'token',{enumerable:true,configurable:true,get(){tokenReads++;return 'true';}});
 cases.push({label:'request.token',source,request:tokenRequest,expectedPath:'/token'});
 const futureRequest:any=request('true');let futureReads=0;
 Object.defineProperty(futureRequest,'future',{enumerable:true,configurable:true,get(){futureReads++;return true;}});
 cases.push({label:'request.future',source,request:futureRequest,expectedPath:'/future'});
 const readCounts=[()=>sourceIdReads,()=>nestedReads,()=>tokenReads,()=>futureReads];
 for(let index=0;index<cases.length;index++){
  const item=cases[index]!;
  const reference=outcome(()=>referenceValidateCsvBooleanLexical(item.source as any,item.request as any));
  const routed=outcome(()=>route.validateCsvBooleanLexical(item.source as any,item.request as any));
  expect(routed, item.label).toEqual(reference);
  expect(routed.code,item.label).toBe('NON_JSON');
  expect(routed.path,item.label).toBe(item.expectedPath);
  expect(readCounts[index]!(),item.label).toBe(0);
 }
});

test('malformed receipt remains ahead of expected source and request accessors',()=>{
 const guardedSource=JSON.parse(JSON.stringify(source));let sourceReads=0,requestReads=0;
 Object.defineProperty(guardedSource,'id',{enumerable:true,configurable:true,get(){sourceReads++;return 'hidden';}});
 const guardedRequest:any=request('true');
 Object.defineProperty(guardedRequest,'token',{enumerable:true,configurable:true,get(){requestReads++;return 'true';}});
 const expected=outcome(()=>referenceVerifyCsvBooleanLexical({} as any,guardedSource as any,guardedRequest));
 const actual=outcome(()=>route.verifyCsvBooleanLexical({} as any,guardedSource as any,guardedRequest));
 expect(actual).toEqual(expected);
 expect(actual.code).toBe('CSV_BOOLEAN_LEXICAL');
 expect(sourceReads).toBe(0);
 expect(requestReads).toBe(0);
});

test('host non-enumerable fields retain copyJson paths on source and request',()=>{
 const hiddenSource=JSON.parse(JSON.stringify(source));
 Object.defineProperty(hiddenSource,'private',{value:'hidden',enumerable:false,configurable:true});
 const hiddenRequest:any=request('true');
 Object.defineProperty(hiddenRequest,'private',{value:'hidden',enumerable:false,configurable:true});
 for(const [inputSource,inputRequest,expectedPath] of [
  [hiddenSource,request('true'),'/private'],
  [source,hiddenRequest,'/private'],
 ] as const){
  const expected=outcome(()=>referenceValidateCsvBooleanLexical(inputSource as any,inputRequest as any));
  const actual=outcome(()=>route.validateCsvBooleanLexical(inputSource as any,inputRequest as any));
  expect(actual).toEqual(expected);
  expect(actual.code).toBe('NON_JSON');
  expect(actual.path).toBe(expectedPath);
 }
});
