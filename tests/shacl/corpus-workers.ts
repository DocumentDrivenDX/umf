// SPDX-License-Identifier: MIT OR Apache-2.0
import assert from 'node:assert/strict';
/** Four bounded independent case workers. Every source, format and assertion
 * runs in a fresh invocation; only immutable per-process resources are reused. */
export async function verifyShaclCorpus(kind:'numeric'|'float'|'strings',rows:readonly unknown[]){
 let next=0,assertions=0;const completed=new Set<number>();
 const children=Array.from({length:Math.min(4,rows.length)},()=>Bun.spawn([process.execPath,'tests/shacl/corpus-worker.ts'],{stdin:'ignore',stdout:'pipe',stderr:'pipe',ipc(message:any,child){
  if(message.ready!==true){assert.ok(Number.isInteger(message.index)&&message.index>=0&&message.index<rows.length);assert.ok(!completed.has(message.index),'Duplicate corpus result');completed.add(message.index);assert.equal(message.assertions,kind==='numeric'?12:6);assertions+=message.assertions;}
  const index=next++;child.send(index<rows.length?{kind,index,row:rows[index]}:null);
 }}));
 try{
  const results=await Promise.all(children.map(async child=>{const [stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);return {stdout,stderr,exit};}));
  for(const result of results)assert.equal(result.exit,0,result.stdout+'\n'+result.stderr);
  assert.equal(completed.size,rows.length);assert.equal(assertions,rows.length*(kind==='numeric'?12:6));
 }finally{for(const child of children)if(child.exitCode===null)child.kill();}
}
