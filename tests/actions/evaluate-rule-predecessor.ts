// SPDX-License-Identifier: MIT OR Apache-2.0
import approve from '../../fixtures/actions/approve.json';
import createLink from '../../fixtures/actions/create-link.json';
import type {Document} from '../../src/model/types';
import type {Action,ActionRule} from '../../src/extensions/actions/types';
import {UmfError} from '../../src/model/errors';
import {evaluateActionRule,actionFieldValueKey,type ActionRuleState} from '../../src/extensions/actions/evaluation';

type Outcome={value:boolean}|{refusal:{code:string;message:string;path:string}};
type Case={id:string;fixture?:'approve'|'create-link';ast:unknown;phase?:'pre'|'post';references?:ActionRule['references'];state?:'null-flag'|'post-output'|'frame-absent'|'frame-no-status'|'invalid-frame-literal'|'no-links'|'malformed-links'|'matching-then-malformed-links'|'linked'|'bad-state'|'invalid-runtime-input'|'accessor-state'|'frame-missing'|'frame-malformed'|'post-frame-missing'|'big-overflow'|'big-boundary';action?:'output'|'reads-link'|'big-number'|'big-number-boundary';text?:'exact-limit'};
const int=(n:string)=>({literal:{integerToken:n}}),bool=(b:boolean)=>({literal:{boolean:b}}),op=(operator:string,...args:unknown[])=>({op:operator,args});
const field={state:'pre',frame:'order-read',field:{module:'sales',element:'status'}};
const expr=(ast:unknown)=>JSON.stringify(ast);
const fingerprint=(value:unknown):unknown=>{
 if(value===null||typeof value!=='object')return value;
 const descriptors=Object.getOwnPropertyDescriptors(value);
 return Object.keys(descriptors).map(key=>{
  const descriptor=descriptors[key]!;
  return [key,descriptor.enumerable,'value'in descriptor?fingerprint(descriptor.value):{accessor:true,get:!!descriptor.get,set:!!descriptor.set}];
 });
};

export const cases:Case[]=[
 {id:'input-absent-present-is-false',ast:op('present',{input:'quantity'})},
 {id:'input-absent-unguarded-refuses',ast:op('gt',{input:'quantity'},int('0'))},
 {id:'explicit-null-is-present',ast:op('present',{input:'flag'}),state:'null-flag'},
 {id:'explicit-null-equals-null',ast:op('eq',{input:'flag'},{literal:null}),state:'null-flag'},
 {id:'nullable-boolean-equals-nonnull-boolean',ast:op('eq',{input:'flag'},bool(false)),state:'null-flag'},
 {id:'nullable-mixed-family-refuses',ast:op('eq',{input:'flag'},int('0'))},
 {id:'explicit-null-is-not-boolean',ast:op('not',{input:'flag'}),state:'null-flag'},
 {id:'and-short-circuit-skips-absent-input',ast:op('and',bool(false),op('gt',{input:'quantity'},int('0')))},
 {id:'or-short-circuit-skips-absent-input',ast:op('or',bool(true),op('gt',{input:'quantity'},int('0')))},
 {id:'bigint-add-beyond-safe-integer',ast:op('eq',op('add',int('9007199254740992'),int('1')),int('9007199254740993'))},
 {id:'bigint-exponent-token-equality',ast:op('eq',int('1e3'),int('1000'))},
 {id:'integer-less-than',ast:op('lt',int('-10'),int('-1'))},
 {id:'integer-less-than-or-equal',ast:op('le',int('5'),int('5'))},
 {id:'integer-greater-than-or-equal',ast:op('ge',int('6'),int('5'))},
 {id:'bigint-negative-subtraction-order',ast:op('gt',op('sub',int('1'),int('2')),int('-2'))},
 {id:'boolean-equality',ast:op('eq',bool(true),bool(true))},
 {id:'string-field-equality',ast:op('eq',field,{literal:{string:'new'}})},
 {id:'existing-frame-absence-guard-is-false',ast:op('and',{exists:{state:'pre',frame:'order-read'}},op('eq',field,{literal:{string:'new'}})),state:'frame-absent'},
 {id:'existing-frame-unguarded-field-refuses',ast:op('eq',field,{literal:{string:'new'}}),state:'frame-absent'},
 {id:'declared-frame-identity-unavailable-refuses',ast:{exists:{state:'pre',frame:'order-read'}},state:'frame-missing'},
 {id:'malformed-frozen-frame-refuses',ast:{exists:{state:'pre',frame:'order-read'}},state:'frame-malformed'},
 {id:'post-frame-unavailable-refuses',ast:{exists:{state:'post',frame:'order-read'}},phase:'post',state:'post-frame-missing'},
 {id:'post-state-in-precondition-refuses',ast:op('eq',{state:'post',frame:'order-read',field:{module:'sales',element:'status'}},{literal:{string:'done'}}),phase:'pre'},
 {id:'existing-entity-missing-field-present-is-false',ast:op('present',field),state:'frame-no-status'},
 {id:'existing-entity-missing-field-unguarded-refuses',ast:op('eq',field,{literal:{string:'new'}}),state:'frame-no-status'},
 {id:'malformed-stored-field-wrapper-refuses',ast:op('eq',field,field),state:'invalid-frame-literal'},
 {id:'output-precondition-is-refused-before-read',ast:op('eq',{output:'out'},{literal:{string:'approved'}}),phase:'pre',references:[{output:'out'}],action:'output'},
 {id:'postcondition-output-is-read',ast:op('eq',{output:'out'},{literal:{string:'approved'}}),phase:'post',references:[{output:'out'}],state:'post-output',action:'output'},
 {id:'postcondition-missing-output-refuses',ast:op('eq',{output:'out'},{literal:{string:'approved'}}),phase:'post',references:[{output:'out'}],action:'output'},
 {id:'unknown-operator-refuses-during-compilation',ast:{op:'future',args:[]}},
 {id:'unknown-expression-member-refuses-during-compilation',ast:{input:'quantity',future:true}},
 {id:'invalid-syntax-in-short-circuited-branch-still-refuses',ast:op('and',bool(false),{op:'future',args:[]})},
 {id:'exact-depth-32-is-admitted',ast:(()=>{let x:unknown=bool(true);for(let i=0;i<31;i++)x=op('not',x);return x;})()},
 {id:'exact-node-limit-512-is-admitted',ast:op('present',(()=>{const tree=(n:number):unknown=>n?op('and',tree(n-1),tree(n-1)):bool(true);return tree(8);})())},
 {id:'depth-limit-refuses',ast:(()=>{let x:unknown=bool(true);for(let i=0;i<33;i++)x=op('not',x);return x;})()},
 {id:'node-limit-refuses',ast:(()=>{const tree=(n:number):unknown=>n?op('and',tree(n-1),tree(n-1)):bool(true);return tree(9);})()},
 {id:'text-limit-refuses',ast:bool(true),references:[],state:'bad-state'},
 {id:'exact-text-limit-65536-is-admitted',ast:bool(true),text:'exact-limit'},
 {id:'numeric-expansion-refuses-before-evaluation',ast:op('eq',int('1e999999999999999999'),int('1'))},
 {id:'arithmetic-result-at-core-text-boundary-is-admitted',ast:op('gt',op('add',{input:'wideNumber'},int('1')),int('0')),references:[{parameter:'wideNumber'}],state:'big-boundary',action:'big-number-boundary'},
 {id:'runtime-numeric-coefficient-bound-refuses-on-arithmetic-expansion',ast:op('gt',op('add',{input:'wideNumber'},int('1')),int('0')),references:[{parameter:'wideNumber'}],state:'big-overflow',action:'big-number'},
 {id:'relationship-snapshot-missing-refuses',fixture:'create-link',ast:{linked:{state:'pre',relationship:{module:'sales',relationship:'order-customer'},sourceFrame:'order-read',targetFrame:'customer-read'}},references:[{record:{module:'sales',element:'order'}},{record:{module:'sales',element:'customer'}},{relationship:{module:'sales',relationship:'order-customer'}}],state:'no-links'},
 {id:'relationship-snapshot-malformed-refuses',fixture:'create-link',ast:{linked:{state:'pre',relationship:{module:'sales',relationship:'order-customer'},sourceFrame:'order-read',targetFrame:'customer-read'}},references:[{record:{module:'sales',element:'order'}},{record:{module:'sales',element:'customer'}},{relationship:{module:'sales',relationship:'order-customer'}}],state:'malformed-links'},
 {id:'relationship-snapshot-valid-match-before-malformed-entry-still-refuses',fixture:'create-link',ast:{linked:{state:'pre',relationship:{module:'sales',relationship:'order-customer'},sourceFrame:'order-read',targetFrame:'customer-read'}},references:[{record:{module:'sales',element:'order'}},{record:{module:'sales',element:'customer'}},{relationship:{module:'sales',relationship:'order-customer'}}],state:'matching-then-malformed-links'},
 {id:'relationship-snapshot-no-matching-link-is-false',fixture:'create-link',ast:{linked:{state:'pre',relationship:{module:'sales',relationship:'order-customer'},sourceFrame:'order-read',targetFrame:'customer-read'}},references:[{record:{module:'sales',element:'order'}},{record:{module:'sales',element:'customer'}},{relationship:{module:'sales',relationship:'order-customer'}}]},
 {id:'relationship-snapshot-matching-link-is-true',fixture:'create-link',ast:{linked:{state:'pre',relationship:{module:'sales',relationship:'order-customer'},sourceFrame:'order-read',targetFrame:'customer-read'}},references:[{record:{module:'sales',element:'order'}},{record:{module:'sales',element:'customer'}},{relationship:{module:'sales',relationship:'order-customer'}}],state:'linked'},
 {id:'rule-compilation-precedes-invalid-runtime-state',ast:{input:'missing'},state:'bad-state'},
 {id:'valid-rule-then-invalid-runtime-input-refuses',ast:bool(true),references:[],state:'invalid-runtime-input'},
 {id:'valid-rule-then-accessor-runtime-state-refuses',ast:bool(true),references:[],state:'accessor-state'},
];

function setup(which:Case['fixture']='approve'):{document:Document;action:Action;state:ActionRuleState} {
 const document=structuredClone(which==='create-link'?createLink:approve) as unknown as Document;
 const action=(document.modules[0]!.extensions!['umf.actions'] as any).actions[0] as Action;
 if(which==='approve'){
  document.modules[0]!.elements.push({id:'quantity',kind:'field',scalarType:'integer',cardinality:'one',nullability:'required',extensions:{},facets:{integerWidth:{bits:64,signed:true}}},{id:'flag',kind:'field',scalarType:'boolean',cardinality:'one',nullability:'absent-allowed',extensions:{}},{id:'wideNumber',kind:'field',scalarType:'integer',cardinality:'one',nullability:'absent-allowed',extensions:{}});
  action.parameters.push({id:'quantity',kind:'value',field:{module:'sales',element:'quantity'},required:false},{id:'flag',kind:'value',field:{module:'sales',element:'flag'},required:false},{id:'wideNumber',kind:'value',field:{module:'sales',element:'wideNumber'},required:false});
  const read=structuredClone(action.writes[0]!);read.id='order-read';action.reads.push(read);
  return {document,action,state:{inputs:{order:{key:{module:'sales',element:'order',key:'pk'},components:[{string:'o1'}]}},pre:{frames:{'order-read':{exists:true,values:{[actionFieldValueKey({module:'sales',element:'status'})]:{string:'new'}}}},links:[]}}};
 }
 for(const frame of action.writes){const read=structuredClone(frame);read.id=frame.id.replace('write','read');read.create=false;read.delete=false;action.reads.push(read);}
 return {document,action,state:{inputs:{'order-id':{string:'o1'},customer:{key:{module:'sales',element:'customer',key:'pk'},components:[{string:'c1'}]},product:{key:{module:'sales',element:'product',key:'pk'},components:[{string:'p1'}]}},pre:{frames:{'order-read':{exists:true,values:{}},'customer-read':{exists:true,values:{}}},links:[]}}};
}

export function capture():{cases:{id:string;outcome:Outcome}[]} {
 return {cases:cases.map(c=>{
  const {document,action,state}=setup(c.fixture);if(c.action==='output')action.outputs.push({id:'out',kind:'value',field:{module:'sales',element:'status'},required:true});
  if(c.action==='big-number')state.inputs.wideNumber={integerToken:'9'.repeat(4_000_000)};
  if(c.action==='big-number-boundary')state.inputs.wideNumber={integerToken:'1'.repeat(3_999_999)};
  const phase=c.phase??'pre';const rule:ActionRule={language:'umf.actions.rules',version:'1',expression:expr(c.ast),references:c.references??[{parameter:'quantity'},{parameter:'flag'},{record:{module:'sales',element:'order'}}]};
  if(c.state==='null-flag')state.inputs.flag=null;
  if(c.state==='post-output'){state.outputs={out:{string:'approved'}};state.post={frames:{},links:[]};}
  if(c.state==='frame-absent')state.pre.frames['order-read']!.exists=false;
  if(c.state==='frame-missing')delete state.pre.frames['order-read'];
  if(c.state==='frame-malformed')state.pre.frames['order-read']!.exists='yes' as any;
  if(c.state==='post-frame-missing')state.post={frames:{},links:[]};
  if(c.state==='frame-no-status')state.pre.frames['order-read']!.values={};
  if(c.state==='invalid-frame-literal')state.pre.frames['order-read']!.values[actionFieldValueKey({module:'sales',element:'status'})]={string:4} as any;
  if(c.state==='no-links')delete (state.pre as any).links;
  if(c.state==='malformed-links')state.pre.links=[{}] as any;
  if(c.state==='matching-then-malformed-links')state.pre.links=[{relationship:{module:'sales',relationship:'order-customer'},sourceFrame:'order-read',targetFrame:'customer-read'},{}] as any;
  if(c.state==='linked')state.pre.links=[{relationship:{module:'sales',relationship:'order-customer'},sourceFrame:'order-read',targetFrame:'customer-read'}];
  if(c.state==='bad-state')state.inputs={missing:{string:'x'}} as any;
  if(c.state==='invalid-runtime-input')state.inputs={missing:{string:'x'}} as any;
  if(c.state==='accessor-state')state.inputs=Object.defineProperty({},'quantity',{enumerable:true,get:()=>({integerToken:'1'})}) as any;
  if(c.state==='big-overflow')state.inputs.wideNumber={integerToken:'9'.repeat(4_000_000)};
  if(c.state==='big-boundary')state.inputs.wideNumber={integerToken:'1'.repeat(3_999_999)};
  if(c.id==='text-limit-refuses')rule.expression=' '.repeat(65537);
  if(c.text==='exact-limit'){const expression=expr(c.ast);rule.expression=' '.repeat(65536-expression.length)+expression;}
  const before=JSON.stringify(fingerprint(state));
  try{return {id:c.id,outcome:{value:evaluateActionRule(document,action,rule,phase,state)},stateUnchanged:JSON.stringify(fingerprint(state))===before};}
  catch(error){if(error instanceof UmfError)return {id:c.id,outcome:{refusal:{code:error.code,message:error.message,path:error.path}},stateUnchanged:JSON.stringify(fingerprint(state))===before};throw error;}
 })};
}

if(import.meta.main)console.log(JSON.stringify(capture(),null,2));
