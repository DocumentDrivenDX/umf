// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import type {AccountingContext} from '../../src/model/internal/accounting-context';
import {checkCore} from '../../src/generated/core-validators';
import {runAccountedCore} from '../../src/generated/core-validators-accounted';
import currentConformance from '../../fixtures/metamodel/current-conformance.json';
import extensionKindConformance from '../../fixtures/extension-kinds/conformance.json';

const CURRENT_CONFORMANCE_SHA256='bb008a98b8448050748e65f867e7863475ccad9501a5b9229ae9e6d336691544';
const CURRENT_CONFORMANCE_CASES=139;

class TestAccounting implements AccountingContext {
 work=0;
 constructor(private readonly limit=Infinity){}
 charge(_event:string,count=1):void{
  if(this.work+count>this.limit)throw new Error('test accounting limit');
  this.work+=count;
 }
 visit(event:string,_path:string,count=1):void{this.charge(event,count);}
 retainSubject():void{}
 retainBytes():void{}
 scanUtf8(text:string):number{return new TextEncoder().encode(text).length;}
 appendCanonicalChunk(text:string):number{return this.scanUtf8(text);}
}

function compare(document:unknown):{valid:boolean;errors:unknown[];work:number}{
 const ordinaryValid=checkCore(document);
 const ordinaryErrors=structuredClone(checkCore.errors??[]);
 const accounting=new TestAccounting();
 const accounted=runAccountedCore(structuredClone(document),accounting);
 const accountedErrors=structuredClone(accounted.errors);
 expect({valid:accounted.valid,errors:accountedErrors}).toEqual({valid:ordinaryValid,errors:ordinaryErrors});
 return {valid:accounted.valid,errors:accountedErrors,work:accounting.work};
}

test('accounted core matches the complete current-conformance corpus',()=>{
 const bytes=readFileSync('fixtures/metamodel/current-conformance.json');
 expect(createHash('sha256').update(bytes).digest('hex')).toBe(CURRENT_CONFORMANCE_SHA256);
 expect(currentConformance.cases).toHaveLength(CURRENT_CONFORMANCE_CASES);
 for(const item of currentConformance.cases){
  const result=compare(item.document);
  expect(result.work,item.id).toBeGreaterThan(0);
 }
});

test('accounted core matches extension-kind document schema cases',()=>{
 for(const item of extensionKindConformance)compare(item.document);
});

test('accounted core matches focused valid and refusal values',()=>{
 const valid={umf:'0.10.0',id:'r2-focused',vocabularies:{},modules:[]};
 const invalid={umf:'0.10.0',id:'',vocabularies:{},modules:[]};
 expect(compare(valid).valid).toBe(true);
 expect(compare(invalid).valid).toBe(false);
});

test('accounting work overflow refuses before the accounted validator runs',()=>{
 const meter=new TestAccounting(0);
 expect(()=>runAccountedCore({umf:'0.10.0',id:'overflow',vocabularies:{},modules:[]},meter))
  .toThrow('test accounting limit');
 expect(meter.work).toBe(0);
});
