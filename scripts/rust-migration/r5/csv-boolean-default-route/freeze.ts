// SPDX-License-Identifier: MIT OR Apache-2.0
// Frozen TypeScript predecessor for the CSV Boolean lexical default route.
import {createHash} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {readDocument} from '../../../../src/model/document';
import {validateCsvBooleanLexical,verifyCsvBooleanLexical,type CsvBooleanLexicalRequest} from '../../../../src/model/csv-boolean-lexical';
import {boundedJsonBytes} from '../../../../src/model/internal/json-byte-budget';

const root=resolve(import.meta.dir,'../../../../');
const packetPath=resolve(import.meta.dir,'predecessor.json');
const files=['src/model/csv-boolean-lexical.ts','src/model/internal/json-byte-budget.ts','tests/csv-boolean-lexical.test.ts','spec/core/csv-boolean-lexical-operation.schema.json','spec/domain-packs/medical/ontology.json'];
const source=readDocument(await readFile(resolve(root,'spec/domain-packs/medical/ontology.json'),'utf8'),'json');
const request=(token:CsvBooleanLexicalRequest['token'],sourceContext:unknown={source:'original.csv',row:1,column:'active',unknown:{retained:['雪',null]}}):CsvBooleanLexicalRequest=>({profile:'umf.csv-boolean-lexical/1.0.0',field:{module:'domain',element:'patients.active'},token,sourceContext:sourceContext as CsvBooleanLexicalRequest['sourceContext']});
const outcome=(run:()=>unknown)=>{try{return {status:'accepted',value:run()};}catch(e){const error=e as Error&{code?:string;path?:string};return {status:'refused',name:error.name,prototype:Object.getPrototypeOf(error)?.constructor?.name??null,code:error.code??null,path:error.path??'',message:error.message};}};
const summary=(receipt:ReturnType<typeof validateCsvBooleanLexical>)=>receipt;
const cases:Record<string,unknown>={};
for(const token of ['true','false','True','False'] as const)cases[`token:${token}`]=summary(validateCsvBooleanLexical(source,request(token)));
const constrained=structuredClone(source);constrained.modules[0]!.elements.find(e=>e.id==='patients.active')!.allowedValues=[{boolean:false}];cases.allowedValueMismatch=summary(validateCsvBooleanLexical(constrained,request('True')));
const unknown=structuredClone(source);(unknown.modules[0]!.elements.find(e=>e.id==='patients.active') as any).facets={futureBooleanRule:{meaning:'unknown'}};cases.unknownSelectedSemantics=summary(validateCsvBooleanLexical(unknown,request('true')));
cases.wrongFieldKind=outcome(()=>validateCsvBooleanLexical(source,{...request('true'),field:{module:'domain',element:'patients.birth_date'}} as any));
const arrayField=structuredClone(source);arrayField.modules[0]!.elements.find(e=>e.id==='patients.active')!.cardinality='array';cases.wrongFieldCardinality=outcome(()=>validateCsvBooleanLexical(arrayField,request('true')));
cases.unsupportedToken=outcome(()=>validateCsvBooleanLexical(source,{...request('true'),token:'TRUE'} as any));
cases.requestShapeBeforeSourceInspection=outcome(()=>validateCsvBooleanLexical({} as any,{...request('true'),profile:'future'} as any));

const malformed={};let receiptExpectedReads=0;const unreadSource=Object.defineProperty({},'umf',{enumerable:true,get(){receiptExpectedReads++;return '0.10.0';}});
cases.invalidReceiptBeforeExpectedInput={result:outcome(()=>verifyCsvBooleanLexical(malformed as any,unreadSource as any,request('true'))),expectedSourceReads:receiptExpectedReads};
let validReceiptExpectedReads=0;const guardedSource=Object.defineProperty({},'umf',{enumerable:true,get(){validReceiptExpectedReads++;return '0.10.0';}});
cases.validReceiptThenExpectedGetter={result:outcome(()=>verifyCsvBooleanLexical(validateCsvBooleanLexical(source,request('true')),guardedSource as any,request('true'))),expectedSourceReads:validReceiptExpectedReads};

const baseRequest=(context:string)=>({profile:'umf.csv-boolean-lexical/1.0.0',field:{module:'domain',element:'patients.active'},sourceContext:context});
const pairBase=baseRequest('');const pairBytes=boundedJsonBytes({source,request:pairBase} as any);const atPair=baseRequest('x'.repeat(4_000_000-pairBytes));const overPair=baseRequest(`${atPair.sourceContext}x`);
cases.inputByteLimit={limit:4_000_000,exactPairBytes:boundedJsonBytes({source,request:atPair} as any),exact:outcome(()=>validateCsvBooleanLexical(source,atPair as any)),overPairBytes:boundedJsonBytes({source,request:overPair} as any,4_000_001),over:outcome(()=>validateCsvBooleanLexical(source,overPair as any))};
const empty=validateCsvBooleanLexical(source,request('true',''));const receiptBytes=boundedJsonBytes(empty as any);const atReceipt=request('true','x'.repeat(4_000_000-receiptBytes));const overReceipt=request('true',`${atReceipt.sourceContext}x`);
cases.receiptByteLimit={limit:4_000_000,exactReceiptBytes:boundedJsonBytes(validateCsvBooleanLexical(source,atReceipt) as any),exact:outcome(()=>validateCsvBooleanLexical(source,atReceipt)),over:outcome(()=>validateCsvBooleanLexical(source,overReceipt))};

const sourceHashes=Object.fromEntries(await Promise.all(files.map(async path=>[path,createHash('sha256').update(await readFile(resolve(root,path))).digest('hex')])));
const packet={format:'umf-r5-csv-boolean-default-route-predecessor/1',runtime:`Bun ${Bun.version}`,operations:['validateCsvBooleanLexical','verifyCsvBooleanLexical'],cases,sourceHashes};
const bytes=`${JSON.stringify(packet,null,2)}\n`;
if(process.argv.includes('--check')){if(await readFile(packetPath,'utf8')!==bytes)throw new Error('CSV Boolean default-route predecessor drift');console.log(`PASS predecessor packet and ${files.length} authority hashes verified`);}
else if(process.argv.includes('--freeze')){await writeFile(packetPath,bytes);console.log(`FROZEN ${packetPath}`);}
else console.log(bytes);
