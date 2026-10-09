import {describe,test,expect} from 'bun:test';
import {referenceHandlerBuild,runReferenceHandler,type ReferenceHandlerProgram} from '../../scripts/actions-reference/sandbox';
const program=(source:string):ReferenceHandlerProgram=>({id:'qualification',version:'1',build:referenceHandlerBuild(source),source});
describe('actual isolated handler foundation',()=>{
 test('copied authenticated ordered gateway calls and isolated runtime',async()=>{
  const inputs={value:7},calls:unknown[]=[];
  const result=await runReferenceHandler(program(`
   const fs=await import('node:fs');
   const os=await import('node:os');
   let writable=false;try{fs.writeFileSync('/qualification-leak','bad');writable=true;}catch{}
   const routes=fs.readFileSync('/proc/net/route','utf8').trim().split('\\n');
   const value=await gateway.read('read-frame',{module:'m',element:'value'});
   await gateway.set('write-frame',[{field:{module:'m',element:'value'},value:{type:'integer',value:String(value)}}]);
   inputs.value=99;
   return {value,writable,interfaces:Object.keys(os.networkInterfaces()),routes:routes.length,uid:process.getuid(),credentials:Object.keys(process.env).filter(key=>/DATABASE|POSTGRES|PGPASSWORD|TOKEN|SECRET/i.test(key)),mounts:fs.readFileSync('/proc/mounts','utf8').includes('/Users/erik')};
  `),inputs,(operation,args)=>{calls.push([operation,args]);return operation==='read'?7:'changed';});
  expect(result).toEqual({value:7,writable:false,interfaces:['lo'],routes:1,uid:65534,credentials:[],mounts:false});expect(inputs.value).toBe(7);expect(calls).toEqual([['read',['read-frame',{module:'m',element:'value'}]],['set',['write-frame',[{field:{module:'m',element:'value'},value:{type:'integer',value:'7'}}]]]]);
 },15000);
 test('asynchronous candidate dispatch is refused rather than outliving an attempt',async()=>{
  let finish:((value:boolean)=>void)|undefined;const started=Date.now();
  await expect(runReferenceHandler(program("await gateway.exists('frame');return {};"),{},()=>new Promise<boolean>(resolve=>{finish=resolve;}),1500)).rejects.toMatchObject({code:'FRAME_ACCESS'});
  expect(Date.now()-started).toBeLessThan(5000);finish?.(true);
 },10000);
 test('deployment build mismatch refuses before dispatch',async()=>{let calls=0;await expect(runReferenceHandler({...program('return {};'),build:'changed'}, {},()=>{calls++;})).rejects.toMatchObject({code:'ACTION_HANDLER_PROFILE'});expect(calls).toBe(0);});
 test('unauthenticated output and caught gateway refusal cannot finish successfully',async()=>{
  await expect(runReferenceHandler(program(`process.stdout.write(JSON.stringify({kind:'result',id:1,token:'forged',outputs:{}})+'\\n');return {};`),{},()=>{})).rejects.toMatchObject({code:'FRAME_ACCESS'});
  await expect(runReferenceHandler(program(`try{await gateway.delete('outside-frame');}catch{}return {};`),{},()=>{throw Object.assign(new Error('Outside frame'),{code:'FRAME_ACCESS'});})).rejects.toMatchObject({code:'FRAME_ACCESS'});
 },15000);
 test('authenticated malformed requests and stderr flooding refuse',async()=>{
  for(const mutation of ["message.extra=true;","message.id++;","message.operation='database';"]){let calls=0;await expect(runReferenceHandler(program(`const write=process.stdout.write.bind(process.stdout);process.stdout.write=text=>{const message=JSON.parse(text);${mutation}return write(JSON.stringify(message)+'\\n');};await gateway.exists('frame');return {};`),{},()=>{calls++;return true;})).rejects.toMatchObject({code:'FRAME_ACCESS'});expect(calls).toBe(0);}
  await expect(runReferenceHandler(program("process.stderr.write('x'.repeat(70000));return {};"),{},()=>{})).rejects.toMatchObject({code:'LIMIT'});
 },15000);
 test('hostile numeric protocol payloads normalize to FRAME_ACCESS before dispatch',async()=>{
  let calls=0;await expect(runReferenceHandler(program("await gateway.exists(9007199254740992);return {};"),{},()=>{calls++;return true;})).rejects.toMatchObject({code:'FRAME_ACCESS'});expect(calls).toBe(0);
  await expect(runReferenceHandler(program('return {x:9007199254740992};'),{},()=>{})).rejects.toMatchObject({code:'FRAME_ACCESS'});
 },15000);
 test('absolute deadline refuses success even when synchronous dispatch delays timers',async()=>{
  let calls=0;await expect(runReferenceHandler(program("await gateway.exists('frame');return {accepted:true};"),{},()=>{calls++;const until=performance.now()+3100;while(performance.now()<until){}return true;},3000)).rejects.toMatchObject({code:'LIMIT'});expect(calls).toBe(1);
 },10000);
 test('invalid and truncated UTF-8 fail through the profile protocol error',async()=>{
  for(const bytes of ['255','226,130'])await expect(runReferenceHandler(program(`process.stdout.write(Buffer.from([${bytes}]));process.exit(0);`),{},()=>{})).rejects.toMatchObject({code:'FRAME_ACCESS'});
 },15000);
 test('infinite computation, protocol flood and operation 257 abort',async()=>{
  await expect(runReferenceHandler(program('while(true){}'),{},()=>{},1500)).rejects.toMatchObject({code:'LIMIT'});
  await expect(runReferenceHandler(program(`process.stdout.write('x'.repeat(150000));return {};`),{},()=>{})).rejects.toMatchObject({code:'LIMIT'});
  let calls=0;await expect(runReferenceHandler(program(`for(let i=0;i<257;i++)await gateway.exists('frame');return {};`),{},()=>{calls++;return true;})).rejects.toMatchObject({code:'LIMIT'});expect(calls).toBe(256);
 },20000);
});
