import {backend} from '../native/postgresql/runtime';
import {importPostgresqlSql,exportPostgresqlSql,getPostgresqlDdlDeclarations} from '../src';
const name='umf-pg-declarations-'+crypto.randomUUID(),image=(await Bun.file('native/postgresql/catalog/image.json').json()).reference;
async function run(args:string[],input?:string){const child=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});if(input!==undefined){child.stdin!.write(input);child.stdin!.end();}const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);if(code)throw Error(err);return out;}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(db:string,query:string)=>exec(['psql','-X','-U','postgres','-d',db,'-v','ON_ERROR_STOP=1','-At'],query);
const query=`SELECT json_agg(x ORDER BY table_schema,table_name,position) FROM (
 SELECT ns.nspname AS table_schema,c.relname AS table_name,a.attnum AS position,a.attname AS column_name,tn.nspname AS type_schema,t.typname AS type_name
 FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
 JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace tn ON tn.oid=t.typnamespace
 WHERE ns.nspname IN ('sales','support') AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped) x;`;
let created=false;
try{
 await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{if((await exec(['cat','/proc/1/comm'])).trim()!=='postgres')throw Error('Initializing');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}if(!ready)throw Error('PostgreSQL readiness timeout');
 if((await sql('postgres','SHOW server_version_num;')).trim()!=='170004')throw Error('Unexpected PostgreSQL version');
 const original=await Bun.file('fixtures/postgresql/declarations.sql').text(),doc=await importPostgresqlSql(original,backend,{id:'native'}),regenerated=await exportPostgresqlSql(doc,backend),results=[];
 for(const [db,text] of [['original',original],['regenerated',regenerated]]){
  await exec(['createdb','-U','postgres',db!]);await sql(db!,text!);
  await sql(db!,"SET search_path=sales,pg_catalog; CREATE TABLE sales.resolution_probe(value text);");
  results.push(JSON.parse((await sql(db!,query)).trim()));
 }
 if(JSON.stringify(results[0])!==JSON.stringify(results[1]))throw Error('Executed catalogs differ');
 const columns=results[0],probe=columns.find((c:any)=>c.table_name==='resolution_probe');if(probe.type_schema!=='sales'||probe.type_name!=='text')throw Error('Expected search_path domain shadowing');
 const orders=columns.filter((c:any)=>c.table_name==='orders');if(orders.length!==10||!orders.some((c:any)=>c.column_name==='inherited')||!orders.some((c:any)=>c.column_name==='extra'))throw Error('LIKE/ALTER expansion differs');
 const view=getPostgresqlDdlDeclarations(doc),decl=view.declarations.find(d=>d.columns.some(c=>c.element.name==='amount'))!;if(decl.columns.length!==8||decl.columns.find(c=>c.element.name==='label')!.typeResolution!=='unresolved')throw Error('Syntax inventory inferred executed catalog');
 const evidence={image,serverVersion:170004,query,columns,nativeDdlReplay:true,searchPathShadowsText:true,declaredOrderColumns:8,executedOrderColumns:10,scope:'Authored syntax versus native catalog resolution; declaration inventory does not execute DDL'};
 await Bun.write('fixtures/postgresql/ddl-declarations-oracle.json',JSON.stringify(evidence,null,2)+'\n');console.log({columns:columns.length,declaredOrderColumns:8,executedOrderColumns:10});
}finally{if(created)await run(['docker','rm','-f',name]);}
