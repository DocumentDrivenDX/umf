// SPDX-License-Identifier: MIT OR Apache-2.0
// @test-exclusive
import {test,expect} from 'bun:test';
import {cp,mkdir,rm,symlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {ReferenceActionPolicy} from '../../scripts/actions-reference/policy';
import {ReferenceActionExecutor} from '../../scripts/actions-reference/executor';
import {withReferenceStore} from './native-harness';
import {alphabet,trace,NativeRefinementMismatch,type Step} from './native-refinement-model';
/** @covers US-901-AC2 @covers US-901-AC4 @covers US-901-AC5 @covers US-901-AC6 @covers US-901-AC11 */
test('native bounded traces refine independent authorization, token, retirement and atomic-state semantics',async()=>{
 await withReferenceStore(async(store,version)=>{
  // Independent stores use four processes; every transition inside each trace
  // stays serial. This file reserves the packet's existing four worker slots.
  const children=Array.from({length:4},(_,part)=>Bun.spawn([process.execPath,new URL('./native-refinement-worker.ts',import.meta.url).pathname,String(part),'4'],{env:{...process.env,UMF_NATIVE_REFINEMENT_URL:store.url},stdin:'ignore',stdout:'pipe',stderr:'pipe',ipc(){}}));
  try{
   const packets=await Promise.all(children.map(async(child,part)=>{const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);if(code!==0)throw Error('Native refinement worker failed: '+err);const packet=JSON.parse(out);expect(packet.part).toBe(part);expect(packet.checked).toBe(54);expect(packet.transitions).toBe(162);return packet;}));
   const checked=packets.reduce((n,p)=>n+p.checked,0),transitions=packets.reduce((n,p)=>n+p.transitions,0);
   expect(checked).toBe(216);expect(transitions).toBe(648);console.log(JSON.stringify({nativeRefinement:{profile:'umf.actions.finite-idempotent-set/1',nativeVersion:version,alphabet,depth:3,traces:checked,transitions,mismatches:0,scope:'One scalar SET, two tokens, one human/role, serial schedules; no universal graph or concurrent refinement claim'}}));
  }finally{for(const child of children)child.kill();}
 });
},180000);
/** Execute real copied consumer mutations; only a semantic mismatch kills a mutant.
 * Import/setup/runtime failures before trace execution are qualification failures. */
test('native refinement kills replay, authorization and terminal-audit implementation mutants',async()=>{
 const root=new URL('../../',import.meta.url).pathname,directory=root+'.cache/action-refinement-mutants/'+crypto.randomUUID();await mkdir(directory,{recursive:true});const definitions=[
  {id:'skip-replay',file:'executor.ts',from:'if(request.key){const replay=',to:'if(false&&request.key){const replay=',word:['invoke-A','invoke-A'] as Step[],reason:'invoke-A → invoke-A exact replay'},
  {id:'ignore-role-membership',file:'policy.ts',from:'if(rows.length===1)return;',to:'return;',occurrences:2,word:['invoke-A','revoke','invoke-A'] as Step[],reason:'invoke-A → revoke → invoke-A authorization'},
  {id:'omit-terminal-audit',file:'executor.ts',from:'   await tx`insert into action_audit(',to:'   if(false)await tx`insert into action_audit(',word:['invoke-A'] as Step[],reason:'invoke-A atomic audit'}
 ];
 try{await withReferenceStore(async(store,version)=>{const witnesses=[];for(const definition of definitions){await trace(store,'control-'+definition.id,definition.word);const home=directory+'/'+definition.id;await mkdir(home+'/scripts',{recursive:true});await cp(root+'scripts/actions-reference',home+'/scripts/actions-reference',{recursive:true});await symlink(root+'src',home+'/src','dir');const path=home+'/scripts/actions-reference/'+definition.file,source=await Bun.file(path).text();if(source.split(definition.from).length-1!==('occurrences' in definition?definition.occurrences:1))throw Error('Mutation source anchor count differs');const changed=source.replaceAll(definition.from,definition.to);await Bun.write(path,changed);const {ReferenceActionExecutor:Executor}=await import(home+'/scripts/actions-reference/executor.ts'),{ReferenceActionPolicy:Policy}=await import(home+'/scripts/actions-reference/policy.ts');let killed=false,reason='';try{await trace(store,'mutant-'+definition.id,definition.word,{Policy,Executor});}catch(error){reason=String(error);if(!(error instanceof NativeRefinementMismatch)||error.context!==definition.reason)throw error;killed=true;}expect(killed).toBe(true);witnesses.push({id:definition.id,sourceSha256:createHash('sha256').update(source).digest('hex'),mutantSha256:createHash('sha256').update(changed).digest('hex'),trace:definition.word,reason});}expect(witnesses).toHaveLength(3);let invocations=0;class RuntimeFaultExecutor extends ReferenceActionExecutor{override async invoke(...args:Parameters<ReferenceActionExecutor['invoke']>){if(++invocations===2)throw Error('INJECTED_RUNTIME_FAILURE');return super.invoke(...args);}}await expect(trace(store,'runtime-failure-control',['invoke-A','invoke-A'],{Policy:ReferenceActionPolicy,Executor:RuntimeFaultExecutor})).rejects.toThrow('Native execution error');expect(invocations).toBe(2);console.log(JSON.stringify({nativeMutation:{nativeVersion:version,killed:3,total:3,witnesses}}));});}finally{await rm(directory,{recursive:true,force:true});}
},90000);
