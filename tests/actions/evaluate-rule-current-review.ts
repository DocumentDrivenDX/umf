// SPDX-License-Identifier: MIT OR Apache-2.0
import approve from '../../fixtures/actions/approve.json';
import type {Document} from '../../src/model/types';
import type {Action} from '../../src/extensions/actions/types';
import {UmfError} from '../../src/model/errors';
import {evaluateActionRule,actionFieldValueKey,type ActionRuleState} from '../../src/extensions/actions/evaluation';

type ReviewCase={id:string;kind:'unknown-first'|'declaration-order'|'required-path'|'bad-wrapper'|'stored-bad-wrapper'|'stored-schema-error'|'output-false'|'output-zero'|'output-empty-string'};
export const cases:ReviewCase[]=[
 {id:'unknown-input-precedes-invalid-known-value',kind:'unknown-first'},
 {id:'declared-order-precedes-map-order-and-preserves-schema-error',kind:'declaration-order'},
 {id:'required-input-preserves-exact-predecessor-path',kind:'required-path'},
 {id:'parameter-wrapper-refusal-is-distinct',kind:'bad-wrapper'},
 {id:'stored-wrapper-refusal-is-distinct',kind:'stored-bad-wrapper'},
 {id:'stored-schema-diagnostic-is-preserved',kind:'stored-schema-error'},
 {id:'falsy-output-false-is-ignored',kind:'output-false'},
 {id:'falsy-output-zero-is-ignored',kind:'output-zero'},
 {id:'falsy-output-empty-string-is-ignored',kind:'output-empty-string'},
];

const orderInput={key:{module:'sales',element:'order',key:'pk'},components:[{string:'o1'}]};
const boolRule={language:'umf.actions.rules',version:'1',expression:JSON.stringify({literal:{boolean:true}}),references:[]};
const quantityRule={language:'umf.actions.rules',version:'1',expression:JSON.stringify({op:'gt',args:[{state:'pre',frame:'order-read',field:{module:'sales',element:'quantity'}},{literal:{integerToken:'0'}}]}),references:[{record:{module:'sales',element:'order'}}]};

function setup(kind:ReviewCase['kind']):{document:Document;action:Action;state:ActionRuleState;rule:typeof boolRule|typeof quantityRule} {
 const document=structuredClone(approve) as unknown as Document;
 const action=(document.modules[0]!.extensions!['umf.actions'] as any).actions[0] as Action;
 document.modules[0]!.elements.push(
  {id:'quantity',kind:'field',scalarType:'integer',cardinality:'one',nullability:'absent-allowed',extensions:{},facets:{integerWidth:{bits:64,signed:true}}},
  {id:'flag',kind:'field',scalarType:'boolean',cardinality:'one',nullability:'absent-allowed',extensions:{}},
  {id:'wideNumber',kind:'field',scalarType:'integer',cardinality:'one',nullability:'absent-allowed',extensions:{}},
 );
 action.parameters.push(
  {id:'quantity',kind:'value',field:{module:'sales',element:'quantity'},required:false},
  {id:'flag',kind:'value',field:{module:'sales',element:'flag'},required:false},
  {id:'wideNumber',kind:'value',field:{module:'sales',element:'wideNumber'},required:false},
 );
 const orderRecord=document.modules[0]!.elements.find(e=>e.id==='order')!;
 orderRecord.members!.push({module:'sales',element:'quantity'});
 const read=structuredClone(action.writes[0]!);read.id='order-read';read.fields.push({module:'sales',element:'quantity'});action.reads.push(read);
 const values:Record<string,any>={};
 let inputs:Record<string,any>={order:orderInput};
 let rule:typeof boolRule|typeof quantityRule=boolRule;
 if(kind==='unknown-first')inputs={order:orderInput,flag:{other:true},intruder:{boolean:true}};
 if(kind==='declaration-order')inputs={flag:{other:true},quantity:{integerToken:'9223372036854775808'},order:orderInput};
 if(kind==='required-path')action.parameters.find(p=>p.id==='quantity')!.required=true;
 if(kind==='bad-wrapper')inputs={order:orderInput,quantity:{other:true}};
 if(kind==='stored-bad-wrapper'||kind==='stored-schema-error'){
  rule=quantityRule;
  values[actionFieldValueKey({module:'sales',element:'quantity'})]=kind==='stored-bad-wrapper'?{integerToken:4}:{integerToken:'9223372036854775808'};
 }
 const state:ActionRuleState={inputs:inputs as any,pre:{frames:{'order-read':{exists:true,values}},links:[]}};
 if(kind==='output-false')(state as any).outputs=false;
 if(kind==='output-zero')(state as any).outputs=0;
 if(kind==='output-empty-string')(state as any).outputs='';
 return {document,action,state,rule};
}

export function capture(){
 return {cases:cases.map(testCase=>{
  const {document,action,state,rule}=setup(testCase.kind);
  try{return {id:testCase.id,outcome:{value:evaluateActionRule(document,action,rule as any,'pre',state)}};}
  catch(error){if(error instanceof UmfError)return {id:testCase.id,outcome:{refusal:{code:error.code,message:error.message,path:error.path}}};throw error;}
 })};
}

if(import.meta.main)console.log(JSON.stringify(capture(),null,2));
