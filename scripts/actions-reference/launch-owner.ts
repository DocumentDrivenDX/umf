import {mkdir,open,readdir,unlink,rmdir,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {UmfError} from '../../src/model/types';
const refused=():never=>{throw new UmfError('LIMIT','Owned handler launch is pending operator reconciliation');};
const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const referenceLaunchDirectory=()=>process.env.UMF_REFERENCE_HANDLER_LAUNCH_DIRECTORY??new URL('../../.cache/actions-reference-launch-owner',import.meta.url).pathname;
export interface ReferenceLaunchOwner {profile:'umf.actions.launch-owner/1';owner:string;container:string;installation:string;endpoint:string;daemon:string}
async function dockerMetadata(args:string[],environment:Record<string,string|undefined>):Promise<string>{
 const child=Bun.spawn(['docker',...args],{stdout:'pipe',stderr:'pipe',env:environment});let timer:ReturnType<typeof setTimeout>|undefined;try{const [stdout,_stderr,exit]=await Promise.race([Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{child.kill();reject(new UmfError('LIMIT','Docker installation observation timed out'));},2000);})]);if(exit)return refused();return stdout.trim();}finally{if(timer)clearTimeout(timer);child.kill();}
}
/** Resolve context once, then pin a local endpoint and independently observed daemon for all clients. */
async function installation(environmentInput:Record<string,string|undefined>){
 const environment={...environmentInput},endpoint=environment.DOCKER_CONTEXT?await dockerMetadata(['context','inspect',environment.DOCKER_CONTEXT,'--format','{{.Endpoints.docker.Host}}'],environment):environment.DOCKER_HOST??await dockerMetadata(['context','inspect','--format','{{.Endpoints.docker.Host}}'],environment);
 if(!endpoint.startsWith('unix:///')||endpoint.length>1024||/[\r\n\0]/.test(endpoint))return refused();environment.DOCKER_HOST=endpoint;delete environment.DOCKER_CONTEXT;delete environment.DOCKER_TLS_VERIFY;delete environment.DOCKER_CERT_PATH;
 const daemon=await dockerMetadata(['info','--format','{{.ID}}'],environment);if(!daemon||daemon.length>256||!/^[a-zA-Z0-9:._-]+$/.test(daemon))return refused();return {environment,endpoint,daemon,binding:createHash('sha256').update(JSON.stringify([endpoint,daemon])).digest('hex')};
}
async function syncDirectory(path:string):Promise<void>{const handle=await open(path,'r');try{await handle.sync();}finally{await handle.close();}}
async function persist(path:string,value:unknown):Promise<void>{const handle=await open(path,'wx',0o600);try{await handle.writeFile(JSON.stringify(value));await handle.sync();}finally{await handle.close();}}
/** Stable private cap-one slot. No expiry or process-death auto-release. */
export class ReferenceHandlerLaunchOwner {
 private constructor(readonly directory:string,readonly record:ReferenceLaunchOwner,readonly environment:Record<string,string|undefined>){Object.freeze(record);Object.freeze(environment);Object.freeze(this);}
 get slot():string{return this.directory+'/active';}
 get ownedDirectory():string{return this.slot+'/'+this.record.owner;}
 get ownerFile():string{return this.ownedDirectory+'/owner.json';}
 get acknowledgementFile():string{return this.ownedDirectory+'/ack.json';}
 static async acquire(container:string,environment:Record<string,string|undefined>):Promise<ReferenceHandlerLaunchOwner>{
  if(!container.startsWith('umf-actions-handler-')||!uuid(container.slice('umf-actions-handler-'.length)))return refused();const observed=await installation(environment),directory=referenceLaunchDirectory();await mkdir(directory,{recursive:true,mode:0o700});const privacy=await lstat(directory);if(!privacy.isDirectory()||(privacy.mode&0o077)!==0||privacy.uid!==process.getuid?.())return refused();try{await mkdir(directory+'/active',{mode:0o700});}catch(error){if((error as any)?.code==='EEXIST')return refused();throw error;}
  const lease=new ReferenceHandlerLaunchOwner(directory,{profile:'umf.actions.launch-owner/1',owner:crypto.randomUUID(),container,installation:observed.binding,endpoint:observed.endpoint,daemon:observed.daemon},observed.environment);
  // Any interruption or malformed record leaves admission closed, never an untracked Docker mutation.
  await mkdir(lease.ownedDirectory,{mode:0o700});await persist(lease.ownerFile,lease.record);await syncDirectory(lease.ownedDirectory);await syncDirectory(lease.slot);await syncDirectory(directory);return lease;
 }
 async acknowledge(containerId:string):Promise<void>{if(!/^[0-9a-f]{64}$/.test(containerId))return refused();await persist(this.acknowledgementFile,{owner:this.record.owner,containerId});await syncDirectory(this.ownedDirectory);}
 async release():Promise<void>{
  // Nonce-specific unlink and nonrecursive rmdir prevent stale owners erasing later ownership.
  try{await unlink(this.acknowledgementFile);}catch(error){if((error as any)?.code!=='ENOENT')throw error;}
  await unlink(this.ownerFile);await rmdir(this.ownedDirectory);await rmdir(this.slot);await syncDirectory(this.directory);
 }
 static async retained(environment:Record<string,string|undefined>):Promise<{lease:ReferenceHandlerLaunchOwner;containerId?:string}>{
  const observed=await installation(environment),directory=referenceLaunchDirectory(),owners=await readdir(directory+'/active');if(owners.length!==1||!uuid(owners[0]))return refused();let value:any;try{value=JSON.parse(await Bun.file(directory+'/active/'+owners[0]+'/owner.json').text());}catch{return refused();}
  if(!value||Object.keys(value).sort().join(',')!=='container,daemon,endpoint,installation,owner,profile'||value.profile!=='umf.actions.launch-owner/1'||!uuid(value.owner)||typeof value.container!=='string'||!value.container.startsWith('umf-actions-handler-')||!uuid(value.container.slice('umf-actions-handler-'.length))||value.installation!==observed.binding||value.endpoint!==observed.endpoint||value.daemon!==observed.daemon||owners[0]!==value.owner)return refused();
  const lease=new ReferenceHandlerLaunchOwner(directory,value,observed.environment),files=await readdir(lease.ownedDirectory);if(files.some(file=>file!=='owner.json'&&file!=='ack.json'))return refused();if(!files.includes('ack.json'))return {lease};let ack:any;try{ack=JSON.parse(await Bun.file(lease.acknowledgementFile).text());}catch{return refused();}if(!ack||Object.keys(ack).sort().join(',')!=='containerId,owner'||ack.owner!==value.owner||typeof ack.containerId!=='string'||!/^[0-9a-f]{64}$/.test(ack.containerId))return refused();return {lease,containerId:ack.containerId};
 }
}

/** Trusted operator recovery. An unknown launch requires the original create operation's acknowledged CID. */
export async function recoverReferenceHandlerLaunch(acknowledgedContainerId?:string):Promise<{container:string;containerId:string;cleanupConfirmed:true}>{
 const {lease,containerId:retained}=await ReferenceHandlerLaunchOwner.retained({...process.env}),environment=lease.environment,cid=retained??acknowledgedContainerId;if(!cid||!/^[0-9a-f]{64}$/.test(cid)||retained&&acknowledgedContainerId&&retained!==acknowledgedContainerId)return refused();
 const deadline=performance.now()+2000;
 const docker=async(args:string[])=>{if(performance.now()>=deadline)return refused();const child=Bun.spawn(['docker',...args],{stdout:'pipe',stderr:'pipe',env:environment});let timer:ReturnType<typeof setTimeout>|undefined;try{const result=await Promise.race([Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]),new Promise<never>((_,reject)=>{timer=setTimeout(()=>{child.kill();reject(new UmfError('LIMIT','Launch recovery timed out'));},Math.max(1,deadline-performance.now()));})]);return {stdout:result[0].trim(),exit:result[2]};}finally{if(timer)clearTimeout(timer);child.kill();}};
 const inspected=await docker(['inspect','--format','{{json .}}',cid]);if(inspected.exit===0){let item:any;try{item=JSON.parse(inspected.stdout);}catch{return refused();}if(item.Id!==cid||item.Name!=='/'+lease.record.container)return refused();}else if(!retained)return refused();
 if(!retained)await lease.acknowledge(cid);await docker(['rm','-f',cid]);const remaining=await docker(['container','ls','--all','--quiet','--filter','id='+cid]);if(remaining.exit!==0||remaining.stdout)return refused();await lease.release();return {container:lease.record.container,containerId:cid,cleanupConfirmed:true};
}
