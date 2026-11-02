import {expect,test} from 'bun:test';
import {UmfError} from '../../src/model/types';
import {ReferenceHandlerLaunchOwner} from '../../scripts/actions-reference/launch-owner';
import {referenceHandlerBuild,runReferenceHandler} from '../../scripts/actions-reference/sandbox';
import type {ReferenceHandlerTimingObservation} from '../../scripts/actions-reference/timing';

type FakeProcess={stdout:ReadableStream<Uint8Array>;stderr:ReadableStream<Uint8Array>;exited:Promise<number>;kill:()=>void;stdin?:{write:(value:string)=>void;flush:()=>void;end:()=>void}};
const bytes=(value:string)=>new TextEncoder().encode(value);
function stream(value:string):ReadableStream<Uint8Array>{return new ReadableStream({start(controller){controller.enqueue(bytes(value));controller.close();}});}
function fakeEnvironment(mode:'success'|'hang'|'hang-bad-inspect'|'slow-cleanup'|'deadline-check'|'bad-protocol'|'bad-protocol-bad-inspect',ownerDelayMs=0){
 const calls:string[][]=[],ownerCalls={acquire:0,acknowledge:0,release:0};let token='';
 const makeProcess=(stdout:string,stderr='',exit=0,kill?:()=>void,stdin?:FakeProcess['stdin']):FakeProcess=>({stdout:stream(stdout),stderr:stream(stderr),exited:Promise.resolve(exit),kill:kill??(()=>{}),...(stdin?{stdin}:{})});
 const oldSpawn=Bun.spawn,oldAcquire=ReferenceHandlerLaunchOwner.acquire;
 const spawn=(argv:string[])=>{
  if(argv[0]!=='docker')throw new Error('Unexpected non-Docker process launch in fake host');
  calls.push([...argv]);
  if(argv[1]==='create'){token=argv.at(-1)!;return makeProcess('a'.repeat(64)+'\n') as unknown as ReturnType<typeof Bun.spawn>;}
  if(argv[1]==='start'){
   const input={kind:'ready',id:0,token};
   const success={kind:'result',id:1,token,outputs:{ok:true}};
   const delayedCall={kind:'call',id:1,token,operation:'exists',args:['opaque-frame']};
   if(mode==='hang'||mode==='hang-bad-inspect'){
    let controller:ReadableStreamDefaultController<Uint8Array>|undefined;
    const stdout=new ReadableStream<Uint8Array>({start(value){controller=value;}});
    let closed=false;
    const child:FakeProcess={stdout,stderr:stream(''),exited:Promise.resolve(0),kill(){if(!closed){closed=true;controller?.close();}},stdin:{write(){},flush(){},end(){}}};
    return child as unknown as ReturnType<typeof Bun.spawn>;
   }
   const message=mode.includes('bad-protocol')?'{}\n':mode==='deadline-check'?[input,delayedCall].map(value=>JSON.stringify(value)+'\n').join(''):[input,success].map(value=>JSON.stringify(value)+'\n').join('');
   return makeProcess(message,'',0,undefined,{write(){},flush(){},end(){}}) as unknown as ReturnType<typeof Bun.spawn>;
  }
  if(argv[1]==='inspect'){const process=makeProcess((mode==='bad-protocol-bad-inspect'||mode==='hang-bad-inspect')?'[]':JSON.stringify({ExitCode:0,OOMKilled:false,Running:false}));if(mode==='slow-cleanup')process.exited=Bun.sleep(45).then(()=>0);return process as unknown as ReturnType<typeof Bun.spawn>;}
  if(argv[1]==='rm'||argv[1]==='container')return makeProcess('') as unknown as ReturnType<typeof Bun.spawn>;
  throw new Error('Unexpected Docker command in fake host: '+argv[1]);
 };
 (Bun as unknown as {spawn:typeof Bun.spawn}).spawn=spawn as unknown as typeof Bun.spawn;
 (ReferenceHandlerLaunchOwner as unknown as {acquire:typeof ReferenceHandlerLaunchOwner.acquire}).acquire=async()=>{
  ownerCalls.acquire++;if(ownerDelayMs)await Bun.sleep(ownerDelayMs);
  return {environment:{},record:{owner:'not-emitted'},acknowledge:async(id:string)=>{if(id!=='a'.repeat(64))throw new Error('Unexpected acknowledgement');ownerCalls.acknowledge++;},release:async()=>{ownerCalls.release++;}} as unknown as ReferenceHandlerLaunchOwner;
 };
 return {calls,ownerCalls,restore(){(Bun as unknown as {spawn:typeof Bun.spawn}).spawn=oldSpawn;(ReferenceHandlerLaunchOwner as unknown as {acquire:typeof ReferenceHandlerLaunchOwner.acquire}).acquire=oldAcquire;}};
}
const program=()=>{const source='return {ok:true};';return {id:'test',version:'1',source,build:referenceHandlerBuild(source)};};

test('runReferenceHandler emits only safe ordered milestones and observer failures do not affect output',async()=>{
 const fake=fakeEnvironment('success',35),events:ReferenceHandlerTimingObservation[]=[];
 try{
  const result=await runReferenceHandler(program(),{privateInput:'never-report'},()=>true,20,undefined,event=>{events.push(event);throw new Error('observer failure');});
  expect(result).toEqual({ok:true});
  expect(events.map(event=>event.stage)).toEqual(['attempt-entered','owner-acquire-start','owner-acquire-complete','execution-deadline-start','container-create-dispatched','container-create-acknowledged','container-start-dispatched','protocol-ready','handler-result-received','cleanup-started','cleanup-confirmed']);
  expect(events[2]!.elapsedMs-events[1]!.elapsedMs).toBeGreaterThanOrEqual(25);
  for(const event of events){expect(Object.keys(event).sort()).toEqual(['elapsedMs','stage']);expect(Number.isSafeInteger(event.elapsedMs)).toBe(true);expect(JSON.stringify(event)).not.toContain('privateInput');expect(JSON.stringify(event)).not.toContain('a'.repeat(64));}
  expect(fake.ownerCalls).toEqual({acquire:1,acknowledge:1,release:1});
  expect(fake.calls.map(call=>call[1])).toEqual(['create','start','inspect','rm','container']);
 }finally{fake.restore();}
});

test('runReferenceHandler distinguishes execution timeout from cleanup outcome without changing error code',async()=>{
 const fake=fakeEnvironment('hang-bad-inspect'),events:ReferenceHandlerTimingObservation[]=[];
 try{
  await expect(runReferenceHandler(program(),{},()=>true,35,undefined,event=>{events.push(event);throw new Error('diagnostic observer failure');})).rejects.toMatchObject({code:'LIMIT'});
  expect(events.map(event=>event.stage)).toEqual(['attempt-entered','owner-acquire-start','owner-acquire-complete','execution-deadline-start','container-create-dispatched','container-create-acknowledged','container-start-dispatched','execution-timeout','cleanup-started','cleanup-unconfirmed']);
  expect(fake.ownerCalls).toEqual({acquire:1,acknowledge:1,release:1});
  expect(fake.calls.map(call=>call[1])).toEqual(['create','start','inspect','rm','container']);
 }finally{fake.restore();}
});

test('runReferenceHandler retains existing cleanup-failure precedence while reporting cleanup unconfirmed',async()=>{
 const fake=fakeEnvironment('bad-protocol-bad-inspect'),events:ReferenceHandlerTimingObservation[]=[];
 try{
  let failure:unknown;
  try{await runReferenceHandler(program(),{},()=>true,100,undefined,event=>events.push(event));}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(UmfError);expect((failure as UmfError).code).toBe('LIMIT');
  expect(events.map(event=>event.stage)).toEqual(['attempt-entered','owner-acquire-start','owner-acquire-complete','execution-deadline-start','container-create-dispatched','container-create-acknowledged','container-start-dispatched','cleanup-started','cleanup-unconfirmed']);
  expect(fake.ownerCalls).toEqual({acquire:1,acknowledge:1,release:1});
  expect(fake.calls.map(call=>call[1])).toEqual(['create','start','inspect','rm','container']);
 }finally{fake.restore();}
});


test('cleanup time after execution completion does not report an execution timeout',async()=>{
 const fake=fakeEnvironment('slow-cleanup'),events:ReferenceHandlerTimingObservation[]=[];
 try{
  expect(await runReferenceHandler(program(),{},()=>true,20,undefined,event=>events.push(event))).toEqual({ok:true});
  expect(events.map(event=>event.stage)).toContain('cleanup-confirmed');
  expect(events.map(event=>event.stage)).not.toContain('execution-timeout');
  expect(fake.ownerCalls).toEqual({acquire:1,acknowledge:1,release:1});
  expect(fake.calls.map(call=>call[1])).toEqual(['create','start','inspect','rm','container']);
 }finally{fake.restore();}
});


test('runReferenceHandler preserves the original protocol error when cleanup succeeds',async()=>{
 const fake=fakeEnvironment('bad-protocol'),events:ReferenceHandlerTimingObservation[]=[];
 try{
  let failure:unknown;
  try{await runReferenceHandler(program(),{},()=>true,100,undefined,event=>events.push(event));}catch(error){failure=error;}
  expect(failure).toBeInstanceOf(UmfError);expect((failure as UmfError).code).toBe('FRAME_ACCESS');
  expect(events.map(event=>event.stage)).toEqual(['attempt-entered','owner-acquire-start','owner-acquire-complete','execution-deadline-start','container-create-dispatched','container-create-acknowledged','container-start-dispatched','cleanup-started','cleanup-confirmed']);
  expect(fake.ownerCalls).toEqual({acquire:1,acknowledge:1,release:1});
  expect(fake.calls.map(call=>call[1])).toEqual(['create','start','inspect','rm','container']);
 }finally{fake.restore();}
});


test('absolute-deadline checks report timeout once even before the timer callback runs',async()=>{
 const fake=fakeEnvironment('deadline-check'),events:ReferenceHandlerTimingObservation[]=[];
 try{
  await expect(runReferenceHandler(program(),{},()=>{const until=performance.now()+45;while(performance.now()<until){}return true;},20,undefined,event=>events.push(event))).rejects.toMatchObject({code:'LIMIT'});
  expect(events.map(event=>event.stage)).toEqual(['attempt-entered','owner-acquire-start','owner-acquire-complete','execution-deadline-start','container-create-dispatched','container-create-acknowledged','container-start-dispatched','protocol-ready','execution-timeout','cleanup-started','cleanup-confirmed']);
  expect(events.filter(event=>event.stage==='execution-timeout')).toHaveLength(1);
  expect(fake.ownerCalls).toEqual({acquire:1,acknowledge:1,release:1});
  expect(fake.calls.map(call=>call[1])).toEqual(['create','start','inspect','rm','container']);
 }finally{fake.restore();}
});
