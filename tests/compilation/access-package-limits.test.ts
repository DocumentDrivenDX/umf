// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {packageAccessFiles} from '../../src/compilation/bundle/index';
import type {Disposition} from '../../src/compilation/ir/index';
import {profile,request} from './access-fixtures';

// @covers US-080-AC4 -- trusted packager guard controls, not a claim that the
// fixed single-package emitter can author 1,000 files or 100,000 dispositions.
const bytes=(value:string)=>new TextEncoder().encode(value).length;
function pack(texts:{path:string;text:string}[],dispositions:Disposition[]=[]){
 return packageAccessFiles(request(),profile(),texts,[],dispositions,[],[]);
}
function refused(result:ReturnType<typeof pack>){
 expect(result.outcome).toBe('refused');expect(result.files).toEqual([]);
 expect(result.symbols).toEqual([]);expect(result.diagnostics.some(d=>d.code==='LIMIT')).toBe(true);
}
test('package file bound includes both source archive and manifest',()=>{
 const texts=(n:number)=>Array.from({length:n},(_,i)=>({path:`shop/m${i}.py`,text:''}));
 const at=pack(texts(998));expect(at.outcome).toBe('candidate');expect(at.files).toHaveLength(1000);
 refused(pack(texts(999)));
});
test('32 MiB output boundary includes the complete manifest, with no truncation',()=>{
 const empty=pack([{path:'shop/data.txt',text:''}]);expect(empty.outcome).toBe('candidate');
 const overhead=empty.files.reduce((n,f)=>n+bytes(f.text),0),size=33554432-overhead;
 const at=pack([{path:'shop/data.txt',text:'x'.repeat(size)}]);
 expect(at.outcome).toBe('candidate');expect(at.files.reduce((n,f)=>n+bytes(f.text),0)).toBe(33554432);
 expect(at.files.find(f=>f.path==='shop/data.txt')!.text.length).toBe(size);
 refused(pack([{path:'shop/data.txt',text:'x'.repeat(size+1)}]));
},30000);
test('packager independently refuses disposition bound plus one',()=>{
 const dispositions=(n:number):Disposition[]=>Array.from({length:n},(_,i)=>({id:`d${i}`,sourceId:'logical',pointer:`/unselected/${i}`,assertion:'kind',relevance:'unselected',fidelity:'unknown',checks:['informational'],reason:'Retained test declaration',obligationIds:[]}));
 const at=pack([],dispositions(100000));expect(at.outcome).toBe('candidate');expect(at.dispositions).toHaveLength(100000);
 refused(pack([],dispositions(100001)));
},30000);
