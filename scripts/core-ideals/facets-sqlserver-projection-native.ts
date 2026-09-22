/** Independent native execution of authored facet projection output. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {importSqlServerCatalog,exportSqlServerCatalog,getSqlServerColumnMetadata,readDocument,writeDocument} from '../../src';
import {facetsSqlServerProjectionCases} from './facets-sqlserver-projection-cases';
import {projectFacetsToSqlServer,recoverFacetsFromSqlServer} from '../../src/core-ideals/facets-sqlserver-projection';
const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090',name='umf-facets-sqlserver-'+randomUUID(),password='Umf!'+randomUUID()+'A9';
let created=false,sqlcmd='/opt/mssql-tools18/bin/sqlcmd';
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [stdout,stderr,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);assert.equal(code,0,stderr||stdout);return {stdout,stderr};}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),'-e','SQLCMDPASSWORD='+password,name,...args],input);
const sql=(db:string,text:string)=>exec([sqlcmd,'-S','tcp:127.0.0.1,1433','-U','sa','-C','-I','-b','-l','2','-t','30','-r','1','-y','0','-w','65535','-d',db],text);
const json=async(text:string)=>{const r=await sql('umf_facets',text);return {value:JSON.parse(r.stdout.split(/\r?\n/).join('').trim()),messages:r.stderr};};
try{
 await run(['docker','run','-d','--platform','linux/amd64','--name',name,'--network','none','-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer','-e','MSSQL_SA_PASSWORD='+password,image]);created=true;
 let ready=false;for(let i=0;i<120;i++){
  assert.equal((await run(['docker','inspect','--format','{{.State.Running}}',name])).stdout.trim(),'true','SQL Server stopped');
  try{await sql('master','SET NOCOUNT ON; SELECT 1;');ready=true;break;}catch(error){if(String(error).includes('mutually exclusive'))throw error;if(i===0){try{await exec(['test','-x',sqlcmd]);}catch{sqlcmd='/opt/mssql-tools/bin/sqlcmd';}}}
  if(i%20===19)console.log(JSON.stringify({startupAttempts:i+1}));await Bun.sleep(1000);
 }assert.ok(ready,'SQL Server startup did not complete');
 await sql('master','CREATE DATABASE umf_facets;');
 const cases=facetsSqlServerProjectionCases().map(c=>({...c,result:projectFacetsToSqlServer(c.author,c.request)})),emitted=cases.filter(c=>c.result.status==='projected');
 const query=await Bun.file('native/sqlserver/catalog-v3.sql').text();
 await sql('umf_facets','CREATE SCHEMA facet_projection;');
 // Each DDL is executed by SQL Server, not parsed by the implementation under test.
 for(const [index,c] of emitted.entries()){
  if(index%40===0)console.log(JSON.stringify({ddl:index,total:emitted.length}));
  await sql('umf_facets',c.result.nativeSql!);
  assert.deepEqual(recoverFacetsFromSqlServer(c.result,c.result.nativeSql!),c.author.target);
 }
 const pick=(name:string,encoding='checked')=>emitted.find(c=>c.name===name&&c.request.encoding===encoding&&c.request.mode==='report')!;
 const probes:{id:string;statement:string;error:number;expected:string|null}[]=[];
 const insert=(id:string,name:string,value:string,expected:string|null,error=0,encoding='checked',output='CONVERT(nvarchar(max),[value])')=>{
  const c=pick(name,encoding);assert.ok(c,name);
  probes.push({id,statement:`BEGIN TRANSACTION; INSERT INTO [facet_projection].[${c.request.tableName.replaceAll(']',']]')}] ([value]) VALUES (${value}); SELECT @out=${output} FROM [facet_projection].[${c.request.tableName.replaceAll(']',']]')}]; ROLLBACK;`,error,expected});
 };
 insert('signed8-min','smallint-8-true','-128','-128');insert('signed8-max','smallint-8-true','127','127');insert('signed8-below','smallint-8-true','-129',null,547);insert('signed8-above','smallint-8-true','128',null,547);
 insert('tinyint-max','tinyint-8-false','255','255');insert('signed8-null','smallint-8-true','NULL',null);
 insert('decimal-rounded-before-check','decimal-5-2','1.235','1.24');insert('decimal-max','decimal-5-2','999.99','999.99');insert('decimal-overflow','decimal-5-2','1000',null,8115);
 const max127=(2n**126n-1n).toString(),min127=(-(2n**126n)).toString();
 insert('wide-integer-min','decimal-integer-127',min127,min127);insert('wide-integer-max','decimal-integer-127',max127,max127);insert('wide-integer-above','decimal-integer-127',(2n**126n).toString(),null,547);
 insert('decimal38-max','decimal-38-0','9'.repeat(38),'9'.repeat(38));insert('decimal38-fraction','decimal-38-38','0.'+'9'.repeat(38),'0.'+'9'.repeat(38));
 const hex='CONVERT(varchar(max),CONVERT(varbinary(max),[value]),2)';
 insert('binary-2','bytes-varbinary-2','0x0001','0001',0,'checked',hex);insert('binary-over','bytes-varbinary-2','0x000102',null,547,'checked',hex);
 insert('binary-empty','bytes-varbinary-0','0x','',0,'checked',hex);insert('binary-zero-refuses','bytes-varbinary-0','0x00',null,547,'checked',hex);
 insert('binary-modifier-over','bytes-varbinary-2','0x000102',null,2628,'type-modifier',hex);
 insert('unicode-empty','length-nvarchar-0',"N''",'',0,'checked',hex);insert('unicode-zero-refuses','length-nvarchar-0',"NCHAR(0)",null,547,'checked',hex);
 insert('unicode-spaces','length-nvarchar-2',"N'a  '",null,547,'checked',hex);
 insert('unicode-astral','length-nvarchar-2','CONVERT(nvarchar(max),0x3DD800DE)','3DD800DE',0,'checked',hex);
 insert('unicode-malformed-residual','length-nvarchar-2','CONVERT(nvarchar(max),0x00D8)','00D8',0,'checked',hex);
 insert('unicode-modifier-astral','length-nvarchar-2','CONVERT(nvarchar(max),0x3DD800DE3DD800DE)',null,2628,'type-modifier',hex);
 insert('real-narrows','facetless-real','CONVERT(float(53),1.0000000000000002)','1.0000000000000000e+000',0,'checked','CONVERT(varchar(100),[value],3)');
 insert('float-retains','facetless-float(53)','CONVERT(float(53),1.0000000000000002)','1.0000000000000002e+000',0,'checked','CONVERT(varchar(100),[value],3)');
 const rows=[];
 for(const probe of probes){
  const statement=probe.statement.replaceAll("'","''");
  const result=await json(`SET NOCOUNT ON; SET ANSI_WARNINGS ON; SET ARITHABORT ON; SET NUMERIC_ROUNDABORT OFF; DECLARE @value nvarchar(max)=NULL,@error int=0,@message nvarchar(2048)=NULL; BEGIN TRY EXEC sys.sp_executesql N'${statement}',N'@out nvarchar(max) OUTPUT',@out=@value OUTPUT; END TRY BEGIN CATCH SET @error=ERROR_NUMBER(); SET @message=ERROR_MESSAGE(); IF @@TRANCOUNT>0 ROLLBACK; END CATCH; SELECT @error AS error,@value AS value,@message AS message FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;`);
  assert.equal(result.value.error,probe.error,probe.id+': '+JSON.stringify(result.value));assert.equal(result.value.value,probe.expected,probe.id);rows.push({...probe,actual:result.value,messages:result.messages});
 }
 const capture=(await json(query)).value;capture.query=query;assert.equal(capture.serverVersion,'16.0.4295.3');assert.equal(capture.tables.length,emitted.length);
 const control=pick('smallint-8-true');assert.equal(capture.tables.find((t:any)=>t.name===control.request.tableName).columns[0].description,control.author.target.modules[0]!.elements[0]!.description);
 for(const t of capture.tables){assert.equal(t.columns.length,1);assert.equal(t.columns[0].is_nullable,true);}
 const sourceText=JSON.stringify(capture,null,2)+'\n',document=importSqlServerCatalog(sourceText,{id:'sqlserver-facet-projections'});
 for(const format of ['json','yaml'] as const)assert.deepEqual(JSON.parse(exportSqlServerCatalog(readDocument(writeDocument(document,format),format))),capture);
 const paths=['scripts/core-ideals/facets-sqlserver-projection-native.ts','scripts/core-ideals/facets-sqlserver-projection-cases.ts','src/core-ideals/facets-sqlserver-projection.ts','spec/core/facets-sqlserver-projection.schema.json','src/core-ideals/sqlserver-syntax.ts','native/sqlserver/catalog-v3.sql'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 const result={scope:'Independent execution of authored SQL Server facet projection DDL and representative stored-value/input-conversion probes; no full binding acceptance',image,serverVersion:capture.serverVersion,cases:cases.map(c=>({name:c.name,request:c.request,status:c.result.status,nativeSql:c.result.nativeSql??null})),probes:rows,sourceText,projected:emitted.length,blocked:cases.length-emitted.length,serializationRecoveries:2,idealRecoveries:emitted.length,sha256};
 await Bun.write('fixtures/validation/facets-sqlserver-projection-native.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({cases:cases.length,projected:emitted.length,blocked:cases.length-emitted.length,probes:rows.length,rejections:rows.filter(r=>r.actual.error!==0).length}));
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
