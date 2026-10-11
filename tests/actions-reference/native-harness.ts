import {ReferenceActionStore} from '../../scripts/actions-reference/store';
async function docker(args:string[]):Promise<string>{const child=Bun.spawn(['docker',...args],{stdout:'pipe',stderr:'pipe'}),[stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);if(exit)throw Error('Native container command failed: '+stderr);return stdout.trim();}
/** Each qualification test owns an isolated real server and destroys only its own container. */
export async function withReferenceStore<T>(operation:(store:ReferenceActionStore,version:string,ownedContainer:string)=>Promise<T>):Promise<T>{
 const name='umf-actions-reference-'+crypto.randomUUID(),network=process.env.UMF_REFERENCE_DOCKER_NETWORK;let store:ReferenceActionStore|undefined,started=false;
 try{
  await docker(['run','--rm','-d','--name',name,'-e','POSTGRES_USER=qualification','-e','POSTGRES_PASSWORD=qualification-only','-e','POSTGRES_DB=qualification',...(network?['--network',network]:['-p','127.0.0.1::5432']),'postgres:17.9']);started=true;
  let ready=false;for(let attempt=0;attempt<100;attempt++){try{await docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','qualification','-d','qualification']);ready=true;break;}catch{await Bun.sleep(100);}}if(!ready)throw Error('Native PostgreSQL readiness timed out');
  const authority=network?name+':5432':'127.0.0.1:'+(await docker(['port',name,'5432/tcp'])).split(':').at(-1)!;store=new ReferenceActionStore('postgres://qualification:qualification-only@'+authority+'/qualification');
  const [server]=await store.sql`select current_setting('server_version') as version,current_setting('server_version_num') as number`;if(!server||server.number!=='170009')throw Error('Unqualified native version '+server?.version);
  await store.initialize();return await operation(store,server.version,name);
 }finally{try{if(store)await store.close();}finally{if(started)await docker(['rm','-f',name]);}}
}
