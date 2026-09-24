/** Independent SQL Server execution of projector-generated DDL. Host-only. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {importSqlServerCatalog,exportSqlServerCatalog,getSqlServerIndexMetadata,getSqlServerColumnMetadata} from '../../src/adapters/sqlserver';
import {readDocument,writeDocument} from '../../src';
import {sqlserverKeyProjectionCases} from './key-sqlserver-projection-cases';
import {projectKeysToSqlServer,recoverKeysSqlServerIdeal} from '../../src/core-ideals/key-sqlserver-projection';
import {classifySqlServerKeys,recoverSqlServerKeySource} from '../../src/core-ideals/key-sqlserver';
import {sqlServerKeySessionOptions} from '../../src/core-ideals/key-sqlserver-carriers';
const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090',name='umf-key-projector-'+randomUUID(),password='Umf!'+randomUUID()+'A9';
let created=false,sqlcmd='/opt/mssql-tools18/bin/sqlcmd';
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [stdout,stderr,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);assert.equal(code,0,stderr||stdout);return {stdout,stderr};}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),'-e','SQLCMDPASSWORD='+password,name,...args],input);
const sql=(db:string,text:string)=>exec([sqlcmd,'-S','tcp:127.0.0.1,1433','-U','sa','-C','-I','-b','-l','2','-t','30','-r','1','-y','0','-w','65535','-d',db],text);
const json=async(text:string)=>{const r=await sql('umf_keys',text);return {value:JSON.parse(r.stdout.split(/\r?\n/).join('').trim()),messages:r.stderr};};
try{
 await run(['docker','run','-d','--platform','linux/amd64','--name',name,'--network','none','-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer','-e','MSSQL_SA_PASSWORD='+password,image]);created=true;
 let ready=false;for(let i=0;i<120;i++){assert.equal((await run(['docker','inspect','--format','{{.State.Running}}',name])).stdout.trim(),'true');try{await sql('master','SET NOCOUNT ON; SELECT 1;');ready=true;break;}catch{if(i===0){try{await exec(['test','-x',sqlcmd]);}catch{sqlcmd='/opt/mssql-tools/bin/sqlcmd';}}}if(i%20===19)console.log(JSON.stringify({startupAttempts:i+1}));await Bun.sleep(1000);}assert.ok(ready,'SQL Server startup did not complete');
 await sql('master','CREATE DATABASE umf_keys;');

 const settings=Object.entries(sqlServerKeySessionOptions).map(([k,v])=>`SET ${k} ${v};`).join(' '),quote=(s:string)=>'['+s.replaceAll(']',']]')+']';
 const rows=[],receipts=[];let recoveryCount=0;
 for(const [i,c] of sqlserverKeyProjectionCases().entries()){
  c.request.namespace='dbo';c.request.tableName='key_projection_'+i;c.request.keyNames.forEach(k=>k.name+='_'+i);
  const receipt=projectKeysToSqlServer(c.source,c.authors,c.request);assert.equal(receipt.status,c.expected);
  if(receipt.status==='blocked'){assert.equal(receipt.nativeSql,undefined);continue;}
  receipts.push(receipt);await sql('umf_keys',receipt.nativeSql!);assert.deepEqual(recoverKeysSqlServerIdeal(receipt,receipt.target!),c.source);recoveryCount++;
  const table='[dbo].'+quote(c.request.tableName),columns=c.request.columns.map(col=>quote(col.name)).join(', '),first=c.request.columns[0]!.nativeType;
  const value=first==='bit'?'1':first==='varbinary'?'0x01':first==='nvarchar'?"N'a'":first==='decimal'&&c.name==='decimal'?'1.23':'1';
  const insert=(a:string,b:string)=>`INSERT INTO ${table} (${columns}) VALUES (${a},${b});`;
  const probes=[{id:'insert',statement:insert(value,"N'a'"),error:0},{id:'duplicate',statement:insert(value,"N'a'"),error:2627},{id:'required',statement:insert('NULL',"N'b'"),error:515}];
  if(c.name==='integer-width')probes.push({id:'width-overflow',statement:insert('128',"N'b'"),error:547});
  if(c.name==='decimal')probes.push({id:'input-rounding-collision',statement:insert('1.234',"N'b'"),error:2627});
  if(c.name==='string-length')probes.push({id:'length-overflow',statement:insert("N'abcd'","N'b'"),error:547});
  if(c.name==='binary-length')probes.push({id:'length-overflow',statement:insert('0x01020304',"N'b'"),error:547});
  if(c.name==='binary'||c.name==='binary-length')probes.push({id:'trailing-zero-distinct',statement:insert('0x0100',"N'a '"),error:0});
  if(c.name==='string-length')probes.push({id:'trailing-space-distinct',statement:insert("N'a '","N'a '"),error:0});
  if(c.name==='primary-report')probes.push({id:'alternate-trailing-space-distinct',statement:insert('2',"N'a '"),error:0},{id:'alternate-case-distinct',statement:insert('3',"N'A'"),error:0},{id:'alternate-collision',statement:insert('4',"N'a'"),error:2627},{id:'update-collision',statement:`UPDATE ${table} SET [external_code]=N'a' WHERE [order_id]=2;`,error:2627},{id:'session-precondition',statement:'SET NUMERIC_ROUNDABORT ON; '+insert('5',"N'z'"),error:1934});
  if(c.name==='primary-byte-boundary'||c.name==='alternate-byte-boundary'){const size=c.request.columns[1]!.nativeSize!;probes.push({id:'maximum-key-bytes',statement:insert('2',`REPLICATE(N'x',${size})`),error:0},{id:'maximum-key-bytes-duplicate',statement:insert('3',`REPLICATE(N'x',${size})`),error:2627});}
  for(const probe of probes){
   const statement=probe.statement.replaceAll("'","''"),result=await json(`SET NOCOUNT ON; ${settings} DECLARE @error int=0,@message nvarchar(2048)=NULL; BEGIN TRY EXEC sys.sp_executesql N'${statement}'; END TRY BEGIN CATCH SET @error=ERROR_NUMBER(); SET @message=ERROR_MESSAGE(); END CATCH; SELECT @error AS error,@message AS message FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;`);
   assert.equal(result.value.error,probe.error,c.name+'/'+probe.id+': '+JSON.stringify(result.value));rows.push({case:c.name,...probe,actual:result.value,messages:result.messages});
  }
 }
 const query=await Bun.file('native/sqlserver/catalog-v3.sql').text(),capture=(await json(query)).value;capture.query=query;assert.equal(capture.serverVersion,'16.0.4295.3');
 let verifiedConstraints=0;
 for(const receipt of receipts){
  const table=capture.tables.find((t:any)=>t.schema===receipt.request.namespace&&t.name===receipt.request.tableName);assert.ok(table);
  for(const mapping of receipt.mappings){
   const index=table.indexes.find((x:any)=>x.name===mapping.constraintName);assert.ok(index);assert.equal(index.is_unique,true);assert.equal(index.is_primary_key,mapping.primary);assert.equal(index.is_unique_constraint,!mapping.primary);assert.equal(index.is_disabled,false);assert.equal(index.has_filter,false);assert.equal(index.ignore_dup_key,false);
   assert.deepEqual(index.columns.slice().sort((a:any,b:any)=>a.key_ordinal-b.key_ordinal).map((c:any)=>c.name),mapping.nativeColumns);
   for(const name of mapping.nativeColumns)assert.equal(table.columns.find((c:any)=>c.name===name).is_nullable,false);verifiedConstraints++;
  }
 }
 const sourceText=JSON.stringify(capture,null,2)+'\n',document=importSqlServerCatalog(sourceText,{id:'sqlserver-key-projection-native'}),indexes=getSqlServerIndexMetadata(document);
 const classified=classifySqlServerKeys(document,{nativeSource:sourceText,mode:'report',profile:'captured-stored-values'});
 for(const format of ['json','yaml'] as const){const target=readDocument(writeDocument(classified.target!,format),format);assert.equal(recoverSqlServerKeySource(classified,target),sourceText);recoveryCount++;}
 const paths=['scripts/core-ideals/key-sqlserver-oracle.ts','scripts/core-ideals/key-sqlserver-projection-cases.ts','src/core-ideals/key-sqlserver-projection.ts','src/core-ideals/key-sqlserver-carriers.ts','spec/core/key-sqlserver-projection.schema.json'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 const result={scope:'Generated authored Key DDL on SQL Server 16.0.4295.3: stored-value constraints and explicit input/session counterexamples; retained ideal and native recovery. Not full binding acceptance.',image,serverVersion:capture.serverVersion,rows,projected:receipts.length,blocked:sqlserverKeyProjectionCases().length-receipts.length,recoveryCount,verifiedConstraints,tables:indexes.tables.length,sourceText,sha256};
 await Bun.write('fixtures/validation/key-sqlserver-projection-native.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({probes:rows.length,projected:result.projected,blocked:result.blocked,recoveryCount,verifiedConstraints}));
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
