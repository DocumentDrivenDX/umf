import {expect,test} from 'bun:test';
import casesInput from '../../docs/helix/04-build/evidence/metamodel-authority/api-corrections/cases.json';
import beforeInput from '../../docs/helix/04-build/evidence/metamodel-authority/api-corrections/before.json';
import afterInput from '../../docs/helix/04-build/evidence/metamodel-authority/api-corrections/after.json';
import {resolveCoreDefault} from '../../src/model/schema-properties';
import {checkSchemaLiteral} from '../../src/model/schema-literals';
import {validateDocument} from '../../src/validation/document';
import {executeConstraints} from '../../src/validation/constraint-kernel';
import {Registry} from '../../src/registry/registry';
import type {Document,Validation} from '../../src/model/types';
for(const original of casesInput.cases as any[])test('reviewed current API correction: '+original.id,()=>{
 const c=structuredClone(original);
 if(c.construction){let payload:any=[];if(c.construction.depth)for(let i=0;i<c.construction.depth;i++)payload=[payload];else payload=new Array(c.construction.values).fill(null);c.document.extensions={'umf.future':payload};}
 const input=JSON.stringify(c);let outcome:any;
 try{if(c.operation==='default'){
  const receipt=resolveCoreDefault(c.document,c.field,c.state);outcome={accepted:true,applied:receipt.applied,result:structuredClone(receipt.result)};
  receipt.source.id='mutated-return';if(receipt.result.state==='present'&&receipt.result.value&&typeof receipt.result.value==='object')(receipt.result.value as any).mutated=true;
 }else{checkSchemaLiteral(c.document,c.document.modules[0].elements[0],c.value);outcome={accepted:true};}}
 catch(error:any){outcome={accepted:false,code:error.code??null,path:error.path??null,error:error.message};}
 const after=afterInput.results.find(r=>r.id===c.id)!,before=beforeInput.results.find(r=>r.id===c.id)!;
 expect(outcome).toEqual(after.outcome);expect(JSON.stringify(c)).toBe(input);expect(after.inputUnchanged).toBe(true);expect(before.inputUnchanged).toBe(true);
 expect(validateDocument(c.document)).toEqual(after.document as Validation);
 if(c.construction)expect(after.outcome).toEqual(before.outcome);
 else expect(before.outcome.accepted).toBe(false);
});
test('generic constraint instructions contribute to caller resource accounting',()=>{
 const doc=structuredClone(casesInput.cases[0]!.document) as unknown as Document;
 let count=0,copies=0;
 expect(()=>executeConstraints(doc,{profile:'umf.constraints/1',steps:[{op:'for',as:'n',each:[1,2,3],body:[{op:'let',name:'v',value:{var:'n'}}]}]}, {},new Registry(),(category,n)=>{if(category==='constraint-copy')copies+=n;if(category==='constraint-instruction'){count+=n;if(count>8)throw Error('caller budget exhausted');}})).toThrow('caller budget exhausted');
 expect(count).toBe(9);expect(copies).toBeGreaterThan(0);
});
