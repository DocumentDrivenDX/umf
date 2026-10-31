// SPDX-License-Identifier: MIT OR Apache-2.0
import {SQL} from 'bun';
import {randomUUID} from 'node:crypto';

async function docker(args:string[]):Promise<string>{const child=Bun.spawn(['docker',...args],{stdout:'pipe',stderr:'pipe'}),[stdout,stderr,exit]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);if(exit)throw Error('Owned PostgreSQL fixture command failed: '+stderr);return stdout.trim();}

export interface OwnedPostgresFixture {
 container:string;
 containerId:string;
 version:string;
 versionNumber:string;
 imageId:string;
 imageDigests:string[];
 databaseUrl:(database:string)=>string;
}

/** Own one UUID-named PostgreSQL 17.9 container; callers retain separate isolated databases. */
export async function withOwnedPostgres<T>(options:{prefix:string;database:string;additionalDatabases?:string[]},operation:(fixture:OwnedPostgresFixture)=>Promise<T>):Promise<T>{
 const name=options.prefix+randomUUID(),network=process.env.UMF_REFERENCE_DOCKER_NETWORK;let started=false;
 try{
  await docker(['run','--rm','-d','--name',name,'-e','POSTGRES_USER=qualification','-e','POSTGRES_PASSWORD=qualification-only','-e',`POSTGRES_DB=${options.database}`,...(network?['--network',network]:['-p','127.0.0.1::5432']),'postgres:17.9']);started=true;
  let ready=false;for(let attempt=0;attempt<100;attempt++){try{await docker(['exec',name,'pg_isready','-h','127.0.0.1','-U','qualification','-d',options.database]);ready=true;break;}catch{await Bun.sleep(100);}}if(!ready)throw Error('Owned PostgreSQL readiness timed out');
  const [containerId,imageId,imageDigestResult]=await Promise.all([docker(['inspect','--format','{{.Id}}',name]),docker(['inspect','--format','{{.Image}}',name]),docker(['image','inspect','--format','{{json .RepoDigests}}','postgres:17.9'])]),imageDigests=JSON.parse(imageDigestResult) as string[];
  if(!containerId||!imageId.startsWith('sha256:')||!imageDigests.some(digest=>digest.includes('@sha256:')))throw Error('Owned PostgreSQL immutable image identity is unavailable');
  const authority=network?name+':5432':'127.0.0.1:'+(await docker(['port',name,'5432/tcp'])).split(':').at(-1)!;
  const databaseUrl=(database:string)=>`postgres://qualification:qualification-only@${authority}/${database}`,admin=new SQL({url:databaseUrl(options.database)});
  let server:{version:string;number:string}|undefined;
  try{for(const database of options.additionalDatabases??[])await admin.unsafe(`CREATE DATABASE "${database.replaceAll('"','""')}"`).simple();const rows=await admin`select current_setting('server_version') as version,current_setting('server_version_num') as number`;server=rows[0] as any;if(server?.number!=='170009')throw Error('Unqualified PostgreSQL '+server?.version);}finally{await admin.close();}
  return await operation({container:name,containerId,version:server!.version,versionNumber:server!.number,imageId,imageDigests,databaseUrl});
 }finally{if(started)await docker(['rm','-f',name]);}
}
