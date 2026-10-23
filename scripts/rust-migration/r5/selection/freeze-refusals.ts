// SPDX-License-Identifier: MIT OR Apache-2.0
// Emit complete TypeScript predecessor refusal envelopes; capture stdout as a frozen fixture.
import {selectCoreElements} from '../../../../src/model/selection';
import {Registry} from '../../../../src/registry/registry';
import type {Document,ExtensionPackage} from '../../../../src/model/types';
import frozen from './frozen-refusals.json';
const predecessor=await Bun.file('fixtures/validation/core-selection.json').json() as {source:Document};
const capture=(f:()=>unknown)=>{try{return {ok:true,value:f()}}catch(e){const x=e as {code?:string;message?:string;path?:string};return {ok:false,error:{code:x.code??'',message:x.message??String(e),path:x.path??''}}}};
const invalid=structuredClone(predecessor.source);invalid.modules[0]!.elements[0]!.references![0]!.element='absent';
const badShape=structuredClone(predecessor.source);badShape.modules[0]!.elements[0]!.id='';
const packageValue:ExtensionPackage={id:'future.meaning',version:'1.0.0',coreVersion:'0.10.0',description:'Frozen semantic selection refusal',schema:{type:'object'},semantics:'Reject all payloads',scopes:['document','module','element'],capabilities:{validation:'semantic',directions:[],evidence:[]}};
const rejecting=new Registry().register(packageValue,()=>[{code:'FROZEN_REJECT',path:'/extensions/future.meaning',message:'Frozen rejection',severity:'error'}]);
const refusals={invalidReference:capture(()=>selectCoreElements(invalid,{references:'none'})),invalidShape:capture(()=>selectCoreElements(badShape,{references:'none'})),semanticErrorEvenEmpty:capture(()=>selectCoreElements(predecessor.source,{references:'none',names:[]},rejecting)),malformedQuery:capture(()=>selectCoreElements(predecessor.source,{references:'none',extra:true} as never)),large:capture(()=>selectCoreElements({umf:'0.10.0',id:'large',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'e',extensions:{},future:Array(51000).fill('opaque')}]}]} as never,{references:'none'}))};
if(JSON.stringify(refusals)!==JSON.stringify(frozen))throw new Error('Frozen predecessor refusal envelope changed');
console.log(JSON.stringify({frozenRefusals:Object.keys(refusals),unchanged:true}));
