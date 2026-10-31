// SPDX-License-Identifier: MIT OR Apache-2.0
import {randomUUID} from 'node:crypto';
import {mkdir,readFile,rename,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {ReferenceActionStore} from '../../scripts/actions-reference/store';
import {SagaCoordinator} from '../../scripts/saga-reference/coordinator';
import {withOwnedPostgres} from '../native/postgres-fixture';

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
 return withOwnedPostgres({prefix:'umf-saga-reference-',database:'saga_coordinator',additionalDatabases:['saga_provider_a','saga_provider_b']},async fixture=>{
  await recordProviderPlatform(fixture.container,fixture.containerId,fixture.imageId,fixture.imageDigests,{version:fixture.version,number:fixture.versionNumber});
  const coordinator=new SagaCoordinator(fixture.databaseUrl('saga_coordinator')),providers:[ReferenceActionStore,ReferenceActionStore]=[new ReferenceActionStore(fixture.databaseUrl('saga_provider_a')),new ReferenceActionStore(fixture.databaseUrl('saga_provider_b'))];
  try{await coordinator.initialize();await Promise.all(providers.map(store=>store.initialize()));return await operation({coordinator,providers,version:fixture.version,container:fixture.container});}
  finally{for(const store of providers)await store.close().catch(()=>{});await coordinator.close().catch(()=>{});}
 });
}
