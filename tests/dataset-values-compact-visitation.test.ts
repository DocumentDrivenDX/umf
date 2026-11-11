import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {validateCoreDatasetValuesCompact,verifyCoreDatasetValuesCompact} from '../src/index-node-v4';

const fixture=JSON.parse(readFileSync('tests/rust-core/fixtures/r5-dataset-values-compact-default-cutover/frozen-commerce.json','utf8')) as {
 source:Parameters<typeof validateCoreDatasetValuesCompact>[0];input:Parameters<typeof validateCoreDatasetValuesCompact>[1];
};

test('compact verify refuses malformed receipt before visiting current',()=>{
 const visits:string[]=[];
 const current=new Proxy({}, {ownKeys(){visits.push('current');return [] as string[];}});
 expect(()=>verifyCoreDatasetValuesCompact({} as never,current as never,fixture.input as never)).toThrow();
 expect(visits).toEqual([]);
});

test('compact verify visits expected input after current before stale refusal',()=>{
 const receipt=validateCoreDatasetValuesCompact(fixture.source,fixture.input);
 const visits:string[]=[];
 const staleCurrent=new Proxy({}, {ownKeys(){visits.push('current');return [] as string[];}});
 const expectedInput=new Proxy(fixture.input, {ownKeys(target){visits.push('expectedInput');return Reflect.ownKeys(target);}});
 expect(()=>verifyCoreDatasetValuesCompact(receipt,staleCurrent as never,expectedInput as never)).toThrow();
 const firstExpectedInput=visits.indexOf('expectedInput');
 expect(firstExpectedInput).toBeGreaterThan(-1);
 expect(Math.max(...visits.flatMap((visit,index)=>visit==='current'?[index]:[]))).toBeLessThan(firstExpectedInput);
});
