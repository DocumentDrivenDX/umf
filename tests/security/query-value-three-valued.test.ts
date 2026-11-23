// SPDX-License-Identifier: MIT OR Apache-2.0
// @test-exclusive
// Four workers balance known/unknown vectors within each original rule order.
import {test,expect} from 'bun:test';
test('all eight-rule three-valued vectors preserve deny, unknown and disclosure precedence across rule order',async()=>{
 const count=13122,permutationSize=6561;
 const partitions=[0,1].flatMap(permutation=>[0,1].map(parity=>({start:permutation*permutationSize+parity,end:(permutation+1)*permutationSize,stride:2})));
 const children=partitions.map(({start,end,stride})=>Bun.spawn([process.execPath,new URL('./query-value-three-valued-worker.ts',import.meta.url).pathname,String(start),String(end),String(stride)],{stdout:'pipe',stderr:'pipe'}));
 try {
  const results=await Promise.all(children.map(async(child,index)=>{
   const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
   if(exit!==0)throw Error('Corpus worker '+index+' failed: '+stderr+'\n'+stdout);
   const result=JSON.parse(stdout),partition=partitions[index]!;
   expect({start:result.start,end:result.end,stride:result.stride}).toEqual(partition);
   expect(result.summary.states).toBe(Math.ceil((partition.end-partition.start)/partition.stride));
   expect(result.summary.vectorIndices).toHaveLength(result.summary.states);
   // These indices are emitted only AFTER each complete independent vector oracle passes.
   expect(result.summary.vectorIndices).toEqual(Array.from({length:result.summary.states},(_,i)=>partition.start+i*partition.stride));
   return result.summary;
  }));
  const seen=new Uint8Array(count);let checked=0;
  const totals=results.reduce((a,b)=>({states:a.states+b.states,permit:a.permit+b.permit,unknown:a.unknown+b.unknown,deny:a.deny+b.deny}),{states:0,permit:0,unknown:0,deny:0});
  for(const result of results)for(const index of result.vectorIndices){if(!Number.isInteger(index)||index<0||index>=count||seen[index])throw Error('Missing, duplicate or invalid vector coverage');seen[index]=1;checked++;}
  expect(checked).toBe(count);expect(seen.every(value=>value===1)).toBe(true);
  expect(totals.states).toBe(count);expect(totals.permit).toBe(126);expect(totals.unknown).toBe(12610);expect(totals.deny).toBe(386);
  expect(totals.permit+totals.unknown+totals.deny).toBe(count);
 } finally {for(const child of children)if(child.exitCode===null)child.kill();}
// Each of the four workers checks ~3280 vectors and runs for about two minutes; 60s was never enough.
},300000);
