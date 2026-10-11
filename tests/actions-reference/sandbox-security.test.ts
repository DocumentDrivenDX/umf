import {test,expect} from 'bun:test';
import {mkdir,rm} from 'node:fs/promises';
import {createServer,createConnection} from 'node:net';
import {recoverReferenceHandlerLaunch} from '../../scripts/actions-reference/launch-owner';
import {referenceHandlerBuild,referenceHandlerImage,runReferenceHandler,type ReferenceHandlerObservation} from '../../scripts/actions-reference/sandbox';
const program=(source:string)=>({id:'security-qualification',version:'1',build:referenceHandlerBuild(source),source});
async function docker(args:string[]){
 const child=Bun.spawn(['docker',...args],{stdout:'pipe',stderr:'pipe',env:{...process.env}});let timer:ReturnType<typeof setTimeout>|undefined;
 try{const [stdout,stderr,exit]=await Promise.race([Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{child.kill();reject(Error('Qualification Docker command timed out'));},3000);})]);return {stdout:stdout.trim(),stderr,exit};}
 finally{if(timer)clearTimeout(timer);child.kill();}
}
async function absent(name:string){const result=await docker(['inspect',name]);expect(result.exit).not.toBe(0);expect(result.stderr.toLowerCase()).toContain('no such object');}
test('handler clears image and client proxy credentials before any program/subprocess observes environment',async()=>{
 const config='/tmp/umf-handler-docker-config-'+crypto.randomUUID(),oldConfig=process.env.DOCKER_CONFIG,oldHost=process.env.DOCKER_HOST;await mkdir(config);const endpoint=oldHost??(await docker(['context','inspect','--format','{{.Endpoints.docker.Host}}'])).stdout;
 try{await Bun.write(config+'/config.json',JSON.stringify({proxies:{default:{httpProxy:'http://qualification:synthetic-only@127.0.0.1:1'}}}));process.env.DOCKER_CONFIG=config;process.env.DOCKER_HOST=endpoint;
  const control=await docker(['run','--rm','--pull=never','--network=none','--entrypoint','node',referenceHandlerImage,'-e','process.stdout.write(process.env.HTTP_PROXY||"")']);expect(control.exit).toBe(0);expect(control.stdout).toBe('http://qualification:synthetic-only@127.0.0.1:1');
  const observations:ReferenceHandlerObservation[]=[],result=await runReferenceHandler(program(`const child=await import('node:child_process');return {own:process.env,child:JSON.parse(child.execFileSync('node',['-e','process.stdout.write(JSON.stringify(process.env))'],{encoding:'utf8'}))};`),{},()=>{},5000,value=>observations.push(value));const expected={HOME:'/nonexistent',PATH:'/usr/local/bin:/usr/bin:/bin'};expect(result).toEqual({own:expected,child:expected});const finished=observations.find(value=>value.stage==='finished');expect(finished?.cleanupConfirmed).toBe(true);await absent(finished!.container);
 }finally{if(oldConfig===undefined)delete process.env.DOCKER_CONFIG;else process.env.DOCKER_CONFIG=oldConfig;if(oldHost===undefined)delete process.env.DOCKER_HOST;else process.env.DOCKER_HOST=oldHost;await rm(config,{recursive:true,force:true});}
},15000);
test('native host sentinel/socket/listener and external route are inaccessible; kernel confinement is enforced',async()=>{
 const base='/tmp/umf-handler-host-'+crypto.randomUUID(),socket=base+'.socket';let accepted=0;const unix=createServer(connection=>{accepted++;connection.end();}),tcp=createServer(connection=>{accepted++;connection.end();});await Bun.write(base,'host-only-sentinel');await new Promise<void>(resolve=>unix.listen(socket,resolve));await new Promise<void>(resolve=>tcp.listen(0,'127.0.0.1',resolve));const port=(tcp.address() as {port:number}).port;
 try{
  for(const endpoint of [{path:socket},{host:'127.0.0.1',port}])await new Promise<void>((resolve,reject)=>{const connection=createConnection(endpoint);connection.once('error',reject);connection.once('end',resolve);connection.resume();});expect(accepted).toBe(2);accepted=0;
  const observations:ReferenceHandlerObservation[]=[],result=await runReferenceHandler(program(`
   const fs=await import('node:fs'),net=await import('node:net');
   const connect=options=>new Promise(resolve=>{const socket=net.createConnection(options);socket.setTimeout(500);socket.once('connect',()=>{socket.destroy();resolve('connected');});socket.once('error',error=>resolve(error.code));socket.once('timeout',()=>{socket.destroy();resolve('timeout');});});
   let sentinel;try{sentinel=fs.readFileSync(inputs.file,'utf8');}catch(error){sentinel=error.code;}
   let write;try{fs.writeFileSync('/tmp/umf-qualification-write','x');write='written';}catch(error){write=error.code;}
   const status=fs.readFileSync('/proc/self/status','utf8');return {sentinel,write,unix:await connect({path:inputs.socket}),host:await connect({host:'127.0.0.1',port:inputs.port}),external:await connect({host:'198.51.100.1',port:80}),dockerSocket:fs.existsSync('/var/run/docker.sock'),databaseSocket:fs.existsSync('/var/run/postgresql/.s.PGSQL.5432'),caps:status.match(/^CapEff:\\s*(.*)$/m)[1],noPrivileges:status.match(/^NoNewPrivs:\\s*(.*)$/m)[1],seccomp:status.match(/^Seccomp:\\s*(.*)$/m)[1],memory:fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim(),pids:fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim()};
  `),{file:base,socket,port},()=>{},5000,value=>observations.push(value));expect(result).toEqual({sentinel:'ENOENT',write:'EROFS',unix:'ENOENT',host:'ECONNREFUSED',external:'ENETUNREACH',dockerSocket:false,databaseSocket:false,caps:'0000000000000000',noPrivileges:'1',seccomp:'2',memory:'134217728',pids:'32'});expect(accepted).toBe(0);await absent(observations.find(value=>value.stage==='finished')!.container);
 }finally{await Promise.all([new Promise<void>(resolve=>unix.close(()=>resolve())),new Promise<void>(resolve=>tcp.close(()=>resolve()))]);await rm(base,{force:true});await rm(socket,{force:true});}
},15000);
test('native process bound refuses additional forks while successful children are reaped',async()=>{
 const observations:ReferenceHandlerObservation[]=[],result=await runReferenceHandler(program(`
  const {spawn}=await import('node:child_process'),fs=await import('node:fs');const jobs=[],starts=[],closes=[],errors=[];let started=0;
  for(let i=0;i<64;i++){const child=spawn('/usr/bin/sleep',['30'],{stdio:'ignore'});jobs.push(child);closes.push(new Promise(resolve=>child.once('close',resolve)));starts.push(new Promise(resolve=>{child.once('spawn',()=>{started++;resolve();});child.once('error',error=>{errors.push(error.code);resolve();});}));}
  await Promise.all(starts);for(const child of jobs)if(child.pid)child.kill('SIGKILL');await Promise.all(closes);return {started,errors,pids:fs.readFileSync('/sys/fs/cgroup/pids.max','utf8').trim()};
 `),{},()=>{},5000,value=>observations.push(value)) as {started:number;errors:string[];pids:string};expect(result.pids).toBe('32');expect(result.started).toBeGreaterThan(0);expect(result.started).toBeLessThan(32);expect(result.errors.length).toBeGreaterThan(0);expect(result.started+result.errors.length).toBe(64);expect([...new Set(result.errors)]).toEqual(['EAGAIN']);await absent(observations.find(value=>value.stage==='finished')!.container);
},15000);
test('actual cgroup memory exhaustion yields LIMIT with native OOM evidence and confirmed removal',async()=>{
 const observations:ReferenceHandlerObservation[]=[],seen:string[]=[];await expect(runReferenceHandler(program(`const fs=await import('node:fs');await gateway.read('limits',{module:'qualification',element:fs.readFileSync('/sys/fs/cgroup/memory.max','utf8').trim()});const buffers=[];for(;;)buffers.push(Buffer.alloc(8*1024*1024,1));`),{},(_operation,args)=>{seen.push((args[1] as {element:string}).element);return true;},5000,value=>observations.push(value))).rejects.toMatchObject({code:'LIMIT'});expect(seen).toEqual(['134217728']);const finished=observations.find(value=>value.stage==='finished');expect(finished?.oomKilled).toBe(true);expect(finished?.cleanupConfirmed).toBe(true);await absent(finished!.container);
},15000);
test('timeout, malformed protocol and dispatch refusal each independently confirm owned removal',async()=>{
 for(const entry of [{source:'while(true){}',code:'LIMIT',timeout:1500},{source:`process.stdout.write('not-json\\n');return {};`,code:'FRAME_ACCESS',timeout:5000},{source:`await gateway.exists('outside');return {};`,code:'FRAME_ACCESS',timeout:5000}]){const observations:ReferenceHandlerObservation[]=[];await expect(runReferenceHandler(program(entry.source),{},()=>{throw Object.assign(Error('Outside frozen frame'),{code:'FRAME_ACCESS'});},entry.timeout,value=>observations.push(value))).rejects.toMatchObject({code:entry.code});const finished=observations.find(value=>value.stage==='finished');expect(finished?.cleanupConfirmed).toBe(true);await absent(finished!.container);}
},20000);

test('native watchdog stops an executing handler after its Bun supervisor is killed',async()=>{
 const directory='/tmp/umf-handler-watchdog-'+crypto.randomUUID();await mkdir(directory);
 const launch=directory+'/launch.json',marker=directory+'/ready.json',source='await gateway.exists("beacon");while(true){}';
 const module=new URL('../../scripts/actions-reference/sandbox.ts',import.meta.url).pathname;
 const workerSource=`import {writeFileSync} from 'node:fs';import {runReferenceHandler,referenceHandlerBuild} from ${JSON.stringify(module)};let name;const source=${JSON.stringify(source)};await runReferenceHandler({id:'watchdog',version:'1',source,build:referenceHandlerBuild(source)},{},()=>{writeFileSync(${JSON.stringify(marker)},JSON.stringify({container:name,beacon:true}));return true;},10000,observation=>{if(observation.stage==='started'){name=observation.container;writeFileSync(${JSON.stringify(launch)},JSON.stringify({container:name}));}});`;
 const worker=Bun.spawn([process.execPath,'-e',workerSource],{stdout:'ignore',stderr:'pipe',env:{...process.env}});const diagnostics=new Response(worker.stderr).text();let name:string|undefined;
 try{
  const readinessDeadline=performance.now()+5000;
  while(!await Bun.file(marker).exists()&&performance.now()<readinessDeadline)await Bun.sleep(50);
  expect(await Bun.file(marker).exists()).toBe(true);const ready=await Bun.file(marker).json();name=ready.container;expect(ready.beacon).toBe(true);expect(name).toMatch(/^umf-actions-handler-[0-9a-f-]+$/);
  const before=await docker(['inspect','--format','{{json .State}}',name!]);expect(before.exit).toBe(0);expect(JSON.parse(before.stdout).Running).toBe(true);
  const killedAt=performance.now();worker.kill('SIGKILL');await worker.exited;
  await Bun.sleep(250);const afterKill=await docker(['inspect','--format','{{json .State}}',name!]);expect(JSON.parse(afterKill.stdout).Running).toBe(true);
  const deadline=performance.now()+12000;let state:any;
  do{const inspected=await docker(['inspect','--format','{{json .State}}',name!]);expect(inspected.exit).toBe(0);state=JSON.parse(inspected.stdout);if(!state.Running)break;await Bun.sleep(100);}while(performance.now()<deadline);
  expect(performance.now()-killedAt).toBeGreaterThan(8000);expect(state.Running).toBe(false);expect(state.ExitCode).toBe(137);expect(state.OOMKilled).toBe(false);
  // The watchdog bounds execution after host death. An operator/recovery process
  // must remove the stopped orphan; this test does not claim automatic removal.
  expect((await recoverReferenceHandlerLaunch()).container).toBe(name!);await absent(name!);name=undefined;
 }finally{worker.kill('SIGKILL');await worker.exited;if(!name&&await Bun.file(launch).exists())name=(await Bun.file(launch).json()).container;if(name){try{await recoverReferenceHandlerLaunch();}catch{await docker(['rm','-f',name]);}}await diagnostics;await rm(directory,{recursive:true,force:true});}
},20000);
