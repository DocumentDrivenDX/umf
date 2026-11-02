import {expect,test} from 'bun:test';
import {readFile} from 'node:fs/promises';
import {createReferenceHandlerTimingEmitter,referenceHandlerTimingStages,type ReferenceHandlerTimingObservation} from '../../scripts/actions-reference/timing';

test('handler timing observations are closed, monotonic, and observer failures are inert',()=>{
 const seen:ReferenceHandlerTimingObservation[]=[];
 const emit=createReferenceHandlerTimingEmitter(value=>seen.push(value));
 for(const stage of referenceHandlerTimingStages)emit(stage);
 expect(seen.map(value=>value.stage)).toEqual([...referenceHandlerTimingStages]);
 for(let index=0;index<seen.length;index++){
  expect(Object.keys(seen[index]!).sort()).toEqual(['elapsedMs','stage']);
  expect(Number.isSafeInteger(seen[index]!.elapsedMs)).toBe(true);
  expect(seen[index]!.elapsedMs).toBeGreaterThanOrEqual(0);
  if(index)expect(seen[index]!.elapsedMs).toBeGreaterThanOrEqual(seen[index-1]!.elapsedMs);
 }
 expect(()=>createReferenceHandlerTimingEmitter(()=>{throw new Error('diagnostic observer failure');})('execution-timeout')).not.toThrow();
});

test('sandbox milestones remain attached to unchanged execution and cleanup boundaries',async()=>{
 const source=await readFile(new URL('../../scripts/actions-reference/sandbox.ts',import.meta.url),'utf8');
 const ownerStart=source.indexOf("timing('owner-acquire-start')"),ownerAcquire=source.indexOf('ReferenceHandlerLaunchOwner.acquire',ownerStart),ownerDone=source.indexOf("timing('owner-acquire-complete')",ownerAcquire),deadline=source.indexOf('deadline=performance.now()+timeoutMs',ownerDone),deadlineEvent=source.indexOf("timing('execution-deadline-start')",deadline);
 expect(ownerStart).toBeGreaterThanOrEqual(0);expect(ownerAcquire).toBeGreaterThan(ownerStart);expect(ownerDone).toBeGreaterThan(ownerAcquire);expect(deadline).toBeGreaterThan(ownerDone);expect(deadlineEvent).toBeGreaterThan(deadline);
 expect(source.indexOf("timing('container-create-dispatched');const creator=Bun.spawn")).toBeGreaterThanOrEqual(0);
 expect(source.indexOf("timing('container-create-acknowledged');const cid=created.trim()")).toBeGreaterThanOrEqual(0);
 expect(source.indexOf("const start=(cid:string)=>{timing('container-start-dispatched');return Bun.spawn")).toBeGreaterThanOrEqual(0);
 expect(source.indexOf("ready=true;timing('protocol-ready')")).toBeGreaterThanOrEqual(0);
 expect(source.indexOf("result=protocolCopy(message.outputs);finished=true;timing('handler-result-received')")).toBeGreaterThanOrEqual(0);
 expect(source.indexOf("const reportElapsedDeadline=()=>{if(!timeoutReported&&performance.now()>=deadline)")).toBeGreaterThanOrEqual(0);
 expect(source.indexOf("setTimeout(()=>{reportElapsedDeadline();active=false")).toBeGreaterThanOrEqual(0);
 expect(source.indexOf("finally{\n  active=false;if(timer)clearTimeout(timer);creator.kill();if(!naturalEof)child?.kill();timing('cleanup-started')")).toBeGreaterThanOrEqual(0);
 expect(source.indexOf('cleanupDeadline=performance.now()+2000')).toBeGreaterThanOrEqual(0);
 expect(source.indexOf("})]);timing('cleanup-confirmed');}catch(error){timing('cleanup-unconfirmed');throw error;}finally")).toBeGreaterThanOrEqual(0);
 expect(source.indexOf("if(!containerId){timing('cleanup-unconfirmed')")).toBeGreaterThanOrEqual(0);
});

test('fake host timing separates owner wait, execution deadline, and cleanup',async()=>{
 const seen:ReferenceHandlerTimingObservation[]=[];
 const emit=createReferenceHandlerTimingEmitter(value=>seen.push(value));
 emit('owner-acquire-start');await Bun.sleep(10);emit('owner-acquire-complete');emit('execution-deadline-start');await Bun.sleep(15);emit('execution-timeout');emit('cleanup-started');await Bun.sleep(10);emit('cleanup-unconfirmed');
 const elapsed=(stage:ReferenceHandlerTimingObservation['stage'])=>seen.find(value=>value.stage===stage)!.elapsedMs;
 expect(elapsed('owner-acquire-complete')-elapsed('owner-acquire-start')).toBeGreaterThanOrEqual(5);
 expect(elapsed('execution-timeout')-elapsed('execution-deadline-start')).toBeGreaterThanOrEqual(10);
 expect(elapsed('cleanup-unconfirmed')-elapsed('cleanup-started')).toBeGreaterThanOrEqual(5);
});
