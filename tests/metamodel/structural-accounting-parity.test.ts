// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {R2WorkLimitError,R2WorkMeter} from '../../src/table-migration/inventory-r2-context';
import {checkCore} from '../../src/generated/core-validators';
import {runAccountedCore} from '../../src/generated/core-validators-accounted';
import currentConformance from '../../fixtures/metamodel/current-conformance.json';
import extensionKindConformance from '../../fixtures/extension-kinds/conformance.json';

const CURRENT_CONFORMANCE_SHA256='bb008a98b8448050748e65f867e7863475ccad9501a5b9229ae9e6d336691544';
const CURRENT_CONFORMANCE_CASES=139;

function compare(document:unknown):{valid:boolean;errors:unknown[];work:number}{
 const ordinaryValid=checkCore(document);
 const ordinaryErrors=structuredClone(checkCore.errors??[]);
 const accounting=new R2WorkMeter();
 const accounted=runAccountedCore(structuredClone(document),accounting);
 const accountedErrors=structuredClone(accounted.errors);
 expect({valid:accounted.valid,errors:accountedErrors}).toEqual({valid:ordinaryValid,errors:ordinaryErrors});
 return {valid:accounted.valid,errors:accountedErrors,work:accounting.snapshot().work};
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
 const meter=new R2WorkMeter();
 meter.charge('jsonNode',1_000_000,'/test/prefill');
 const before=meter.snapshot();
 expect(()=>runAccountedCore({umf:'0.10.0',id:'overflow',vocabularies:{},modules:[]},meter))
  .toThrow(R2WorkLimitError);
 expect(meter.snapshot()).toEqual(before);
});
