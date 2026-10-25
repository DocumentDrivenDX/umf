import {expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {verifyCoreDatasetValuesCompact} from '../src/model/dataset-values-compact';

const fixture=JSON.parse(readFileSync('docs/helix/04-build/evidence/rust-migration/r5-dataset-values-compact-default-cutover/frozen-commerce.json','utf8')) as {
 result:unknown;source:Record<string,unknown>;input:Record<string,unknown>;
};

test('compact verify refuses malformed receipt before visiting current',()=>{
 const visits:string[]=[];
 const current=new Proxy({}, {ownKeys(){visits.push('current');return [] as string[];}});
 expect(()=>verifyCoreDatasetValuesCompact({} as never,current as never,fixture.input as never)).toThrow();
 expect(visits).toEqual([]);
});

test('compact verify visits expected input after current before stale refusal',()=>{
 const visits:string[]=[];
 const staleCurrent=new Proxy({}, {ownKeys(){visits.push('current');return [] as string[];}});
 const expectedInput=new Proxy(fixture.input, {ownKeys(target){visits.push('expectedInput');return Reflect.ownKeys(target);}});
 expect(()=>verifyCoreDatasetValuesCompact(fixture.result as never,staleCurrent as never,expectedInput as never)).toThrow();
 const firstExpectedInput=visits.indexOf('expectedInput');
 expect(firstExpectedInput).toBeGreaterThan(-1);
 expect(Math.max(...visits.flatMap((visit,index)=>visit==='current'?[index]:[]))).toBeLessThan(firstExpectedInput);
});
