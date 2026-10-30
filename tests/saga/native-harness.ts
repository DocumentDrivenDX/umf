// SPDX-License-Identifier: MIT OR Apache-2.0
import {SQL} from 'bun';
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ReferenceActionStore} from '../../scripts/actions-reference/store';
import {SagaCoordinator} from '../../scripts/saga-reference/coordinator';

async function docker(args:string[]):Promise<string>{const child=Bun.spawn(['docker',...args],{stdout:'pipe',stderr:'pipe'}),[stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);if(exit)throw Error('Saga qualification Docker command failed: '+stderr);return stdout.trim();}
async function recordProviderPlatform(container:string,containerId:string,imageId:string,imageDigests:string[],server:{version:string;number:string}):Promise<void>{
 const path=join(process.cwd(),'.cache','saga','provider-platform.json');await mkdir(join(process.cwd(),'.cache','saga'),{recursive:true});
 const lock=path+'.lock';let locked=false;for(let attempt=0;attempt<200;attempt++){try{await mkdir(lock,{mode:0o700});locked=true;break;}catch(error){if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;await Bun.sleep(25);}}
 if(!locked)throw Error('Provider platform receipt lock timed out');
 try{let prior:{profile?:string;containers?:Record<string,unknown>}={};try{prior=JSON.parse(await readFile(path,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  const temporary=path+'.'+container+'.tmp';await writeFile(temporary,JSON.stringify({profile:'umf.actions.saga.provider-platform/1',containers:{...(prior.containers??{}),[container]:{containerId,imageId,imageDigests,serverVersion:server.version,serverVersionNumber:server.number,observedAt:new Date().toISOString()}}},null,2)+'\n',{mode:0o600});await rename(temporary,path);
 }finally{await rm(lock,{recursive:true,force:true});}
}
export interface SagaNativeCluster {coordinator:SagaCoordinator;providers:[ReferenceActionStore,ReferenceActionStore];version:string;container:string}
/** Each run creates and removes only its UUID-owned PostgreSQL 17.9 container. */
export async function withSagaNativeCluster<T>(operation:(cluster:SagaNativeCluster)=>Promise<T>):Promise<T>{
 const name='umf-saga-reference-'+randomUUID(),network=process.env.UMF_REFERENCE_DOCKER_NETWORK;let started=false,coord:SagaCoordinator|undefined,providers:ReferenceActionStore[]=[];
 try{
  await docker(['run','--rm','-d','--name',name,'-e','POSTGRES_USER=qualification','-e','POSTGRES_PASSWORD=qualification-only','-e','POSTGRES_DB=saga_coordinator',...(network?['--network',network]:['-p','127.0.0.1::5432']),'postgres:17.9']);started=true;
  let ready=false;for(let attempt=0;attempt<100;attempt++){try{await docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','qualification','-d','saga_coordinator']);ready=true;break;}catch{await Bun.sleep(100);}}if(!ready)throw Error('Saga PostgreSQL readiness timed out');
  const [containerId,imageId,imageDigestResult]=await Promise.all([docker(['inspect','--format','{{.Id}}',name]),docker(['inspect','--format','{{.Image}}',name]),docker(['image','inspect','--format','{{json .RepoDigests}}','postgres:17.9'])]);
  const imageDigests=JSON.parse(imageDigestResult) as string[];
  if(!imageId.startsWith('sha256:')||!imageDigests.some(digest=>digest.includes('@sha256:')))throw Error('Saga PostgreSQL immutable image identity is unavailable');
  const authority=network?name+':5432':'127.0.0.1:'+(await docker(['port',name,'5432/tcp'])).split(':').at(-1)!;
  const url=(database:string)=>`postgres://qualification:qualification-only@${authority}/${database}`;
  const admin=new SQL({url:url('saga_coordinator')});try{await admin.unsafe('CREATE DATABASE saga_provider_a').simple();await admin.unsafe('CREATE DATABASE saga_provider_b').simple();const [server]=await admin`select current_setting('server_version') as version,current_setting('server_version_num') as number`;if(server?.number!=='170009')throw Error('Unqualified PostgreSQL '+server?.version);await recordProviderPlatform(name,containerId,imageId,imageDigests,{version:String(server.version),number:String(server.number)});}finally{await admin.close();}
  coord=new SagaCoordinator(url('saga_coordinator'));providers=[new ReferenceActionStore(url('saga_provider_a')),new ReferenceActionStore(url('saga_provider_b'))];await coord.initialize();await Promise.all(providers.map(store=>store.initialize()));return await operation({coordinator:coord,providers:providers as [ReferenceActionStore,ReferenceActionStore],version:'17.9',container:name});
 }finally{for(const store of providers)await store.close().catch(()=>{});if(coord)await coord.close().catch(()=>{});if(started)await docker(['rm','-f',name]).catch(()=>{});}
}
