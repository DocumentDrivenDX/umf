// SPDX-License-Identifier: MIT OR Apache-2.0
import approve from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import type {Action} from '../../src/extensions/actions/types';
import {UmfError} from '../../src/model/errors';
import {schemaCoefficient} from '../../src/model/schema-literals';
import {evaluateActionRule,type ActionRuleState} from '../../src/extensions/actions/evaluation';

type NumericCase={id:string;kind:'evaluate'|'coefficient';expression?:unknown;input?:{id:'wideNumber'|'tiny';token:string};token?:string;precision?:number;scale?:number};
const literal=(token:string)=>({literal:{integerToken:token}});
const op=(operator:string,...args:unknown[])=>({op:operator,args});
const equal=(a:unknown,b:unknown)=>op('eq',a,b);

function makeCase(id:string,expression:unknown,input?:NumericCase['input']):NumericCase{return {id,kind:'evaluate',expression,...(input?{input}:{})};}

let seed=0x5eed1234;
const randomInt=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return (seed%2_000_001)-1_000_000;};
export const cases:NumericCase[]=[
 makeCase('negative-zero-canonicalizes',equal(literal('-0'),literal('0'))),
 makeCase('fractional-trailing-zero-normalizes',equal(literal('1.0'),literal('1'))),
 makeCase('positive-exponent-normalizes',equal(literal('1e3'),literal('1000'))),
 makeCase('negative-exponent-with-trailing-zero-normalizes',equal(literal('10e-1'),literal('1'))),
 makeCase('fractional-nonzero-refuses-rounding',equal(literal('1.5'),literal('1'))),
 makeCase('zero-bypasses-oversized-exponent-spelling',equal(literal('0e'+'9'.repeat(40)),literal('0'))),
 makeCase('nonzero-oversized-exponent-refuses',equal(literal('1e'+'9'.repeat(40)),literal('1'))),
 {id:'precision-check-after-coefficient-normalization',kind:'coefficient',token:'123',precision:2},
 {id:'positive-scale-normalizes-fraction',kind:'coefficient',token:'12.3',scale:1},
 {id:'negative-scale-normalizes-trailing-zeroes',kind:'coefficient',token:'1200',scale:-2},
 {id:'precision-check-after-scale-normalization',kind:'coefficient',token:'1.20',scale:1,precision:2},
 {id:'zero-short-circuits-before-precision',kind:'coefficient',token:'0e'+'9'.repeat(40),precision:0},
 {id:'exponent-spelling-refusal-precedes-resource-and-precision',kind:'coefficient',token:'1e'+'9'.repeat(40),precision:1},
 {id:'resource-check-precedes-precision-after-exponent-expansion',kind:'coefficient',token:'1e4000000',precision:1},
 makeCase('opposite-sign-cancellation-produces-zero',equal(op('add',literal('-37'),literal('37')),literal('0'))),
 makeCase('addition-carry-crosses-all-decimal-digits',equal(op('add',literal('999999'),literal('1')),literal('1000000'))),
 makeCase('subtraction-borrow-crosses-all-decimal-digits',equal(op('sub',literal('1000000'),literal('1')),literal('999999'))),
 makeCase('subtraction-produces-negative-result',equal(op('sub',literal('1'),literal('2')),literal('-1'))),
 makeCase('equality-across-signs-is-false',equal(literal('-1'),literal('1'))),
 makeCase('less-than-across-signs',op('lt',literal('-1'),literal('1'))),
 makeCase('less-than-zero-versus-negative-is-false',op('lt',literal('0'),literal('-1'))),
 makeCase('less-than-or-equal-equal-negative-magnitudes',op('le',literal('-9'),literal('-9'))),
 makeCase('greater-than-or-equal-different-digit-lengths',op('ge',literal('10'),literal('2'))),
 makeCase('greater-than-across-signs',op('gt',literal('1'),literal('-1'))),
 makeCase('greater-than-shorter-positive-is-false',op('gt',literal('2'),literal('10'))),
 makeCase('less-than-or-equal-positive-equal',op('le',literal('7'),literal('7'))),
 makeCase('signed-eight-bit-minimum-is-admitted',equal({input:'tiny'},literal('-128')),{id:'tiny',token:'-128'}),
 makeCase('signed-eight-bit-underflow-refuses',equal({input:'tiny'},literal('-128')),{id:'tiny',token:'-129'}),
];
for(let i=0;i<32;i++){
 const a=randomInt(),b=randomInt();
 cases.push(makeCase(`deterministic-small-arithmetic-${i.toString().padStart(2,'0')}-add`,equal(op('add',literal(String(a)),literal(String(b))),literal(String(a+b)))));
 cases.push(makeCase(`deterministic-small-arithmetic-${i.toString().padStart(2,'0')}-sub`,equal(op('sub',literal(String(a)),literal(String(b))),literal(String(a-b)))));
}

function setup(testCase:NumericCase):{document:Document;action:Action;state:ActionRuleState} {
 const document=structuredClone(approve) as unknown as Document;
 const action=(document.modules[0]!.extensions!['umf.actions'] as any).actions[0] as Action;
 const additions:any[]=[
  {id:'wideNumber',kind:'field',scalarType:'integer',cardinality:'one',nullability:'absent-allowed',extensions:{}},
  {id:'tiny',kind:'field',scalarType:'integer',cardinality:'one',nullability:'absent-allowed',extensions:{},facets:{integerWidth:{bits:8,signed:true}}},
 ];
 document.modules[0]!.elements.push(...additions);
 action.parameters.push(
  {id:'wideNumber',kind:'value',field:{module:'sales',element:'wideNumber'},required:false},
  {id:'tiny',kind:'value',field:{module:'sales',element:'tiny'},required:false},
 );
 const state:ActionRuleState={inputs:{order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'o1'}]}},pre:{frames:{},links:[]}};
 if(testCase.input)state.inputs[testCase.input.id]={integerToken:testCase.input.token};
 return {document,action,state};
}

function refusal(error:unknown){
 if(error instanceof UmfError)return {code:error.code,message:error.message,path:error.path};
 throw error;
}

export const capture=()=>({cases:cases.map(testCase=>{
 try{
  if(testCase.kind==='coefficient')return {id:testCase.id,outcome:{value:schemaCoefficient(testCase.token!,testCase.scale??0,testCase.precision).toString()}};
  const {document,action,state}=setup(testCase);
  const references=testCase.input?[{parameter:testCase.input.id}]:[];
  const rule={language:'umf.actions.rules',version:'1',expression:JSON.stringify(testCase.expression),references};
  return {id:testCase.id,outcome:{value:evaluateActionRule(document,action,rule as any,'pre',state)}};
 }catch(error){return {id:testCase.id,outcome:{refusal:refusal(error)}};}
})});

if(import.meta.main)console.log(JSON.stringify(capture(),null,2));
