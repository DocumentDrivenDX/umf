// Authored native edge probes in a disposable, network-isolated PostgreSQL instance.
export {};
const name='umf-pg-avro-'+crypto.randomUUID(),image=(await Bun.file('native/postgresql/catalog/image.json').json()).reference;
async function run(args:string[],input?:string){const child=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});if(input!==undefined){child.stdin!.write(input);child.stdin!.end();}const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);if(code)throw Error(err);return out;}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const query=`CREATE TEMP TABLE edge(negative numeric(2,-3),fractional numeric(3,5),ordinary numeric(20,4),unconstrained numeric);
SELECT json_build_object('version',current_setting('server_version_num')::int,
'modifiers',(SELECT json_agg(atttypmod ORDER BY attnum) FROM pg_attribute WHERE attrelid='edge'::regclass AND attnum>0),
'values',json_build_array((12345::numeric(2,-3))::text,(0.001234::numeric(3,5))::text,('NaN'::numeric(20,4))::text,('Infinity'::numeric)::text,('infinity'::date)::text,('infinity'::timestamp)::text,('24:00'::time)::text));`;
let created=false;
try{
 await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{if((await exec(['cat','/proc/1/comm'])).trim()!=='postgres')throw Error('Initializing');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}if(!ready)throw Error('PostgreSQL readiness timeout');
 const out=await exec(['psql','-X','-U','postgres','-v','ON_ERROR_STOP=1','-At'],query),result=JSON.parse(out.split('\n').find(l=>l.startsWith('{'))!);
 const expected={version:170004,modifiers:[((2<<16)|(-3&2047))+4,(3<<16)+5+4,(20<<16)+4+4,-1],values:['12000','0.00123','NaN','Infinity','infinity','infinity','24:00:00']};if(JSON.stringify(result)!==JSON.stringify(expected))throw Error('Native edge probes disagree: '+JSON.stringify(result));
 await Bun.write('fixtures/postgresql/avro-source-oracle.json',JSON.stringify({image,query,result,scope:'Native typmod, rounding and exceptional-value evidence; no PostgreSQL to Avro row encoder'},null,2)+'\n');console.log(result);
}finally{if(created)await run(['docker','rm','-f',name]);}
