/** Owned native ordinary-principal pool witness. @covers US-056-AC5 */
import {SQL} from 'bun';
const actors=JSON.parse(process.env.UMF_PG_POOL_ACTORS ?? '{}') as Record<string,{password:string,ids:string[]}>;
const port=process.env.UMF_PG_POOL_PORT;
if(!port || !/^\d+$/.test(port))throw new Error('Missing owned endpoint');
const outputs:Record<string,unknown>={};
for(const [actor,fixture] of Object.entries(actors)){
 if(!/^umf_sec_(alice|bob|outsider)$/.test(actor))throw new Error('Unknown pinned ordinary principal');
 const client=new SQL({hostname:'127.0.0.1',port:Number(port),database:'postgres',username:actor,password:fixture.password,max:1,connectionTimeout:5,idleTimeout:30});
 let baselinePid:number|undefined;
 const identity=async(connection:any)=>{
  const r=(await connection`SELECT session_user::text AS session, current_user::text AS current, pg_backend_pid() AS pid`)[0];
  return {session:r.session,current:r.current,pid:Number(r.pid)};
 };
 const reset=async(connection:any)=>{
  await connection.unsafe('ROLLBACK');
  await connection.unsafe('RESET ALL');await connection.unsafe('RESET ROLE');await connection.unsafe('RESET SESSION AUTHORIZATION');
  const actual=await identity(connection);
  if(actual.session!==actor || actual.current!==actor)throw new Error('Pinned principal reset refused');
 };
 const lease=async(operation:(connection:any)=>Promise<unknown>)=>{
  const connection=await client.reserve();
  let result:unknown;
  try{
   await reset(connection);
   const before=await identity(connection);
   if(baselinePid===undefined)baselinePid=before.pid;
   if(before.pid!==baselinePid)throw new Error('Reuse witness requires same native session');
   await connection.unsafe('BEGIN');
   result=await operation(connection);await connection.unsafe('COMMIT');
   // No buffered result is returned until native cleanup and pinned identity verification.
   await reset(connection);return result;
  }catch(error){
   try{await reset(connection);}catch{await client.close({timeout:1});}
   throw error;
  }finally{connection.release();}
 };
 try{
  const baseline=await lease(async c=>({identity:await identity(c),ids:(await c`SELECT id FROM security_raw.resource ORDER BY id`).map((r:any)=>r.id)})) as any;
  const committed=await lease(async c=>{await c.unsafe('SET ROLE umf_sec_pool_low');return {current:(await identity(c)).current,ids:(await c`SELECT id FROM security_raw.resource ORDER BY id`).map((r:any)=>r.id)};});
  const afterCommit=await lease(async c=>({identity:await identity(c),ids:(await c`SELECT id FROM security_raw.resource ORDER BY id`).map((r:any)=>r.id)})) as any;
  let aborted=false,abortCode:string|undefined,abortedRole:string|undefined,releasedAfterAbort=false;
  try{await lease(async c=>{await c.unsafe('SET ROLE umf_sec_pool_low');abortedRole=(await identity(c)).current;await c.unsafe('SELECT 1/0');return ['must-not-release'];});releasedAfterAbort=true;}catch(error){abortCode=(error as {errno?:string}).errno;aborted=true;}
  const afterAbort=await lease(async c=>({identity:await identity(c),ids:(await c`SELECT id FROM security_raw.resource ORDER BY id`).map((r:any)=>r.id)})) as any;
  // A separate deliberately weakened lease omits reset: session role persists
  // across commit and is observable on the same reused connection.
  const weakened=await client.reserve();let negative:any;
  try{await weakened.unsafe('SET ROLE umf_sec_pool_low');await weakened.unsafe('BEGIN');await weakened.unsafe('COMMIT');negative={identity:await identity(weakened),ids:(await weakened`SELECT id FROM security_raw.resource ORDER BY id`).map((r:any)=>r.id)};}finally{weakened.release();}
  const restored=await lease(async c=>({identity:await identity(c),ids:(await c`SELECT id FROM security_raw.resource ORDER BY id`).map((r:any)=>r.id)})) as any;
  const stable=[baseline,afterCommit,afterAbort,restored];
  outputs[actor]={pinnedIdentity:stable.every(r=>r.identity.session===actor&&r.identity.current===actor),sameNativeSession:stable.every(r=>r.identity.pid===baselinePid)&&negative.identity.pid===baselinePid,baselineIds:baseline.ids,committed,afterCommitIds:afterCommit.ids,abortedWithoutRelease:aborted&&!releasedAfterAbort,abortCode,abortedRole,afterAbortIds:afterAbort.ids,weakenedCurrent:negative.identity.current,weakenedIds:negative.ids,restoredIds:restored.ids};
 }finally{await client.close({timeout:1});}
}
console.log(JSON.stringify({versions:{bun:Bun.version},actors:outputs}));
