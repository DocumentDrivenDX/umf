// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import casesInput from '../../docs/helix/04-build/evidence/metamodel-authority/api-corrections/cases.json';
import afterInput from '../../docs/helix/04-build/evidence/metamodel-authority/api-corrections/after.json';
import {resolveCoreDefault,validateCoreFieldValue} from "../../src/index-node-v4";
import {validateDocument} from '../../src/validation/document';
import {executeConstraints} from './constraint-oracle';
import {Registry} from '../../src/registry/registry';
import type {Document,Validation} from '../../src/model/types';
for(const original of casesInput.cases as any[])test('reviewed current API correction: '+original.id,()=>{
 const c=structuredClone(original);
 if(c.construction){let payload:any=[];if(c.construction.depth)for(let i=0;i<c.construction.depth;i++)payload=[payload];else payload=new Array(c.construction.values).fill(null);c.document.extensions={'umf.future':payload};}
 const input=JSON.stringify(c);let outcome:any;
 try{if(c.operation==='default'){
  const receipt=resolveCoreDefault(c.document,c.field,c.state);outcome={accepted:true,applied:receipt.applied,result:structuredClone(receipt.result)};
  receipt.source.id='mutated-return';if(receipt.result.state==='present'&&receipt.result.value&&typeof receipt.result.value==='object')(receipt.result.value as any).mutated=true;
 }else{const [module]=c.document.modules,[element]=module.elements;outcome={accepted:validateCoreFieldValue(c.document,{module:module.id,element:element.id},c.value).valid};}}
 catch(error:any){outcome={accepted:false,code:error.code??null,path:error.path??null,error:error.message};}
 const after=afterInput.results.find(r=>r.id===c.id)!;
 expect(outcome).toEqual(c.operation==='literal'?{accepted:after.outcome.accepted}:after.outcome);
 expect(JSON.stringify(c)).toBe(input);
 if(c.construction)expect(()=>validateDocument(c.document)).toThrow(expect.objectContaining({code:'LIMIT'}));
 else expect(validateDocument(c.document)).toEqual(after.document as Validation);
});
test('generic constraint instructions contribute to caller resource accounting',()=>{
 const doc=structuredClone(casesInput.cases[0]!.document) as unknown as Document;
 let count=0,copies=0;
 expect(()=>executeConstraints(doc,{profile:'umf.constraints/1',steps:[{op:'for',as:'n',each:[1,2,3],body:[{op:'let',name:'v',value:{var:'n'}}]}]}, {},new Registry(),(category,n)=>{if(category==='constraint-copy')copies+=n;if(category==='constraint-instruction'){count+=n;if(count>8)throw Error('caller budget exhausted');}})).toThrow('caller budget exhausted');
 expect(count).toBe(9);expect(copies).toBeGreaterThan(0);
});
