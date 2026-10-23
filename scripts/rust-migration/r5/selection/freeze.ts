// SPDX-License-Identifier: MIT OR Apache-2.0
// Freeze complete TypeScript predecessor result and refusal envelopes before Rust parity work.
import {mkdir,writeFile} from 'node:fs/promises';
import {selectCoreElements} from '../../../../src/model/selection';
import {Registry} from '../../../../src/registry/registry';
import type {Document,ExtensionPackage} from '../../../../src/model/types';

const source:Document={umf:'0.10.0',id:'r5-selection',vocabularies:{future:{version:'1.0.0'}},extensions:{future:{opaque:{module:'outside',element:'ignored'}}},modules:[
 {id:'sales',namespace:'sales',elements:[{id:'customer',name:'Customer',scalarType:'integer',extensions:{future:{opaque:[1,{retain:true}]}},references:[{role:'account',module:'billing',element:'account',future:'annotation'},{role:'account',module:'billing',element:'account'}]}]},
 {id:'support',namespace:'support',elements:[{id:'customer',name:'Customer',scalarType:'future-scalar',extensions:{}}]},
 {id:'billing',namespace:'billing',elements:[{id:'account',name:'AccountHolder',scalarType:'string',extensions:{},references:[{role:'owner',module:'sales',element:'customer'}]}]},
]};
const surrogateSource:Document={umf:'0.10.0',id:'surrogate',vocabularies:{},modules:[{id:'\ud800',namespace:'',elements:[{id:'\ud800',extensions:{}}]}]};
const capture=(f:()=>unknown)=>{try{return {ok:true,value:f()}}catch(e){const x=e as {code?:string;message?:string;path?:string};return {ok:false,error:{code:x.code??'',message:x.message??String(e),path:x.path??''}}}};
const queries={
 all:{references:'none' as const},
 categoryAnd:{references:'none' as const,modules:['sales','support'],namespaces:['sales','support'],names:['Customer'],scalarTypes:['integer','future-scalar']},
 emptyCategory:{references:'none' as const,names:[]},
 unknownScalar:{references:'none' as const,scalarTypes:['future-scalar']},
 repeatedEdges:{references:'none' as const,names:['Customer']},
 cyclicTraversal:{references:'transitive' as const,identities:[{module:'sales',element:'customer'}]},
 emptyTraversal:{references:'transitive' as const,identities:[]},
};
const cases=Object.fromEntries(Object.entries(queries).map(([name,query])=>[name,selectCoreElements(source,query)]));
const surrogate=selectCoreElements(surrogateSource,{references:'none',identities:[{module:'\ud800',element:'\ud800'}]});
const invalid=structuredClone(source);invalid.modules[0]!.elements[0]!.references![0]!.element='absent';
const invalidShape=structuredClone(source);invalidShape.modules[0]!.elements[0]!.id='';
const packageValue:ExtensionPackage={id:'future',version:'1.0.0',coreVersion:'0.10.0',description:'Frozen semantic selection refusal',schema:{type:'object'},semantics:'Reject all payloads',scopes:['document','module','element'],capabilities:{validation:'semantic',directions:[],evidence:[]}};
const rejecting=new Registry().register(packageValue,()=>[{code:'FROZEN_REJECT',path:'/extensions/future',severity:'error',message:'Frozen rejection'}]);
const refusals={invalidReference:capture(()=>selectCoreElements(invalid,{references:'none'})),invalidShape:capture(()=>selectCoreElements(invalidShape,{references:'none'})),semanticErrorEvenEmpty:capture(()=>selectCoreElements(source,{references:'none',names:[]},rejecting)),malformedQuery:capture(()=>selectCoreElements(source,{references:'none',extra:true} as never)),
 large:capture(()=>selectCoreElements({umf:'0.10.0',id:'large',vocabularies:{},modules:[{id:'m',namespace:'',elements:[{id:'e',extensions:{},future:Array(51000).fill('opaque')}]}]} as never,{references:'none'}))};
const root=new URL('./',import.meta.url);await mkdir(root,{recursive:true});
await writeFile(new URL('input.json',root),JSON.stringify({source,queries,surrogateSource},null,2)+'\n');
await writeFile(new URL('frozen-typescript.json',root),JSON.stringify({cases,surrogate},null,2)+'\n');
await writeFile(new URL('frozen-refusals.json',root),JSON.stringify(refusals,null,2)+'\n');
