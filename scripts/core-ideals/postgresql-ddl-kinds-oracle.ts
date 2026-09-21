import {randomUUID} from 'node:crypto';
import {backend} from '../../native/postgresql/runtime';
import {importPostgresqlSql} from '../../src/adapters/postgresql';
import {getPostgresqlDdlDeclarations} from '../../src/adapters/postgresql/declarations';
import {upgradeFieldEnvelope} from '../../src/model/field-transition';
import {classifyPostgresqlDdlRecord,recoverPostgresqlDdlKinds} from '../../src/core-ideals/postgresql-ddl-kinds';
import {ddlKindCases} from './postgresql-ddl-kind-cases';
const name='umf-ddl-kinds-'+randomUUID();let created=false;
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});if(input!==undefined){p.stdin!.write(input);p.stdin!.end();}const [stdout,stderr,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(stderr);return stdout;}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(text:string)=>exec(['psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose'],text);
const manifest=await Bun.file('native/postgresql/catalog/image.json').json();
try{
 if(!/^postgres@sha256:[0-9a-f]{64}$/.test(manifest.reference))throw Error('Unpinned image');
 await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',manifest.reference]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{if((await exec(['cat','/proc/1/comm'])).trim()!=='postgres')throw Error('Initializing');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}if(!ready)throw Error('Server not ready');
 const version=(await sql('SHOW server_version_num')).trim();if(version!=='170004')throw Error('Wrong native version');await sql('CREATE SCHEMA sales;');
 const rows=[];
 for(const c of ddlKindCases){
  let accepted=true;try{await sql('SET search_path=sales,pg_catalog;\n'+c.sql);}catch(error){if(c.nativeAccepted||!String(error).includes('42701'))throw error;accepted=false;}
  if(accepted!==c.nativeAccepted)throw Error('Unexpected native acceptance');
  let nativeKind:string|null=null;let finalNames:string[]=[];if(accepted){finalNames=JSON.parse((await sql("SELECT coalesce(json_agg(attname ORDER BY attnum),'[]'::json) FROM pg_attribute WHERE attrelid='"+c.relation+"'::regclass AND attnum>0 AND NOT attisdropped")).trim());if(JSON.stringify(finalNames)!==JSON.stringify(c.finalNames??c.names))throw Error('Unexpected catalog membership');}
  if(accepted)nativeKind=(await sql("SELECT relkind FROM pg_class WHERE oid='"+c.relation+"'::regclass")).trim();
  const source=upgradeFieldEnvelope(await importPostgresqlSql(c.sql,backend,{id:c.id})).target;
  const declaration=getPostgresqlDdlDeclarations(source).declarations.find(d=>d.relation.kind==='object'&&d.relation.members.relname?.kind==='string'&&d.relation.members.relname.value===c.name)!;
  if(accepted&&nativeKind!==(declaration.kind==='create-composite'?'c':'r'))throw Error('Native relation kind differs');
  for(const mode of ['strict','report'] as const){const request={module:'declared',recordId:'record',declaration:declaration.path,mode},result=await classifyPostgresqlDdlRecord(source,request,backend);
   const blocked=c.expansion||!c.nativeAccepted||c.namespace===''&&mode==='strict';if((result.status==='blocked')!==blocked)throw Error('Unexpected classification');
   if(result.target){if(JSON.stringify(result.target.modules.at(-1)!.elements.slice(1).map(e=>e.name))!==JSON.stringify(c.names))throw Error('Declaration membership');if(await recoverPostgresqlDdlKinds(result,result.target,backend)!==c.sql)throw Error('Source lost');}
   rows.push({case:c,finalNames,nativeKind,source,request,result});
  }
 }
 await Bun.write('fixtures/validation/postgresql-ddl-kinds-native.json',JSON.stringify({scope:'Declared-only table/composite classification, not final catalog or name resolution',image:manifest.reference,version,rows},null,2)+'\n');console.log(JSON.stringify({cases:ddlKindCases.length,classifications:rows.filter(r=>r.result.target).length,blocked:rows.filter(r=>!r.result.target).length}));
}finally{if(created)await run(['docker','rm','-f',name]);}
