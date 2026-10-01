/** Host-only SQL Server 2022 generated relationship enforcement oracle. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {relationshipSqlServerCases} from './relationship-sqlserver-cases';
import {projectRelationshipToSqlServer,recoverRelationshipSqlServerIdeal} from '../../src/core-ideals/relationship-sqlserver-projection';
import {classifySqlServerRelationships,recoverSqlServerRelationshipSource} from '../../src/core-ideals/relationship-sqlserver';
import {importSqlServerCatalog} from '../../src/adapters/sqlserver';
const image='mcr.microsoft.com/mssql/server@sha256:4402d880dd4c34bfa7d8705e56a86cd6c88da80a1f6bbbe741f999e76264a090',name='umf-relationship-'+randomUUID(),password='Umf!'+randomUUID()+'A9';
let created=false,sqlcmd='/opt/mssql-tools18/bin/sqlcmd';
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [stdout,stderr,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);assert.equal(code,0,stderr||stdout);return {stdout,stderr};}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),'-e','SQLCMDPASSWORD='+password,name,...args],input);
const sql=(db:string,text:string)=>exec([sqlcmd,'-S','tcp:127.0.0.1,1433','-U','sa','-C','-I','-b','-l','2','-t','30','-r','1','-y','0','-w','65535','-d',db],text);
const json=async(text:string)=>{const r=await sql('umf_relationships',text);return {value:JSON.parse(r.stdout.split(/\r?\n/).join('').trim()),messages:r.stderr};};
try{
 await run(['docker','run','-d','--platform','linux/amd64','--name',name,'--network','none','-e','ACCEPT_EULA=Y','-e','MSSQL_PID=Developer','-e','MSSQL_SA_PASSWORD='+password,image]);created=true;
 let ready=false;for(let i=0;i<120;i++){assert.equal((await run(['docker','inspect','--format','{{.State.Running}}',name])).stdout.trim(),'true');try{await sql('master','SET NOCOUNT ON; SELECT 1;');ready=true;break;}catch{if(i===0){try{await exec(['test','-x',sqlcmd]);}catch{sqlcmd='/opt/mssql-tools/bin/sqlcmd';}}}if(i%20===19)console.log(JSON.stringify({startupAttempts:i+1}));await Bun.sleep(1000);}assert.ok(ready,'SQL Server startup did not complete');
 await sql('master','CREATE DATABASE umf_relationships;');

 const rows:any[]=[],receipts=[];const q=(s:string)=>'['+s.replaceAll(']',']]')+']',tuple=(v:string[])=>v.map(q).join(', ');
 async function probe(id:string,statement:string,error:number|number[]){const escaped=statement.replaceAll("'","''"),r=await json(`SET NOCOUNT ON; DECLARE @error int=0,@message nvarchar(2048)=NULL; BEGIN TRY EXEC sys.sp_executesql N'${escaped}'; END TRY BEGIN CATCH SET @error=ERROR_NUMBER(); SET @message=ERROR_MESSAGE(); END CATCH; SELECT @error AS error,@message AS message FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES;`);assert.ok((Array.isArray(error)?error:[error]).includes(r.value.error),id+': '+JSON.stringify(r.value));rows.push({id,statement,expected:error,actual:r.value});}
 for(const [i,c] of relationshipSqlServerCases().entries()){
  c.request.namespace='relationship_'+i;const r=projectRelationshipToSqlServer(c.source,c.author,c.binding,c.request);assert.equal(r.status,c.expected);if(!r.target)continue;receipts.push(r);
  await sql('umf_relationships',`CREATE SCHEMA ${q(c.request.namespace)};`);await sql('umf_relationships',r.target.sql);assert.deepEqual(recoverRelationshipSqlServerIdeal(r,r.target),c.source);
  const p=c.request,table=(name:string)=>q(p.namespace)+'.'+q(name),sourceTable=table('Source'),targetTable=table(c.name.startsWith('self-')?'Source':'Target'),sourceNames=p.sourceKey.columns.map(x=>x.name),targetNames=p.targetKey.columns.map(x=>x.name),values=(n:number,k:number)=>Array(k).fill(String(n)).join(', '),insert=(t:string,names:string[],vals:string)=>`INSERT INTO ${t} (${tuple(names)}) VALUES (${vals});`;
  const target=(n:number)=>insert(targetTable,targetNames,values(n,targetNames.length)),source=(n:number,ref:string)=>insert(sourceTable,[...sourceNames,...p.referenceColumns],values(n,sourceNames.length)+', '+ref);
  if(p.junction){
   const j=p.junction,join=(a:number,b:number)=>insert(table(j.tableName),[...j.sourceColumns,...p.referenceColumns],values(a,j.sourceColumns.length)+', '+values(b,p.referenceColumns.length));
   await probe(c.name+'/target',target(1),0);await probe(c.name+'/source',insert(sourceTable,sourceNames,values(1,sourceNames.length)),0);
   await probe(c.name+'/link',join(1,1),0);await probe(c.name+'/duplicate-pair',join(1,1),2627);await probe(c.name+'/dangling-target',join(1,999),547);await probe(c.name+'/second-target',target(2),0);await probe(c.name+'/dangling-source',join(999,2),547);
   await probe(c.name+'/no-minimum',insert(sourceTable,sourceNames,values(2,sourceNames.length)),0);
   await probe(c.name+'/reverse-maximum',join(2,1),c.name.startsWith('junction-one-')?2627:0);
   if(c.name.startsWith('junction-bounded-'))for(const n of [2,3,4,5]){if(n!==2)await probe(c.name+'/extra-target-'+n,target(n),0);await probe(c.name+'/exceeds-max-'+n,join(1,n),0);}
  }else{
   if(!c.name.startsWith('self-'))await probe(c.name+'/target',target(1),0);
   await probe(c.name+'/linked',source(1,values(1,p.referenceColumns.length)),0);await probe(c.name+'/dangling',source(2,values(p.targetKey.columns[0]!.nativeType==='bit'?0:99,p.referenceColumns.length)),547);
   await probe(c.name+'/duplicate-source',source(1,values(1,p.referenceColumns.length)),2627);
   const nullable=c.source.modules[0]!.relationships![0]!.targetMultiplicity.min===0;
   await probe(c.name+'/null',source(3,Array(p.referenceColumns.length).fill('NULL').join(', ')),nullable?0:515);
   if(p.referenceColumns.length>1)await probe(c.name+'/partial-null',source(4,['NULL',...Array(p.referenceColumns.length-1).fill('999')].join(', ')),nullable?547:515);
   const max=c.source.modules[0]!.relationships![0]!.sourceMultiplicity.max;
   await probe(c.name+'/reverse-maximum',source(5,values(1,p.referenceColumns.length)),max===1?2601:0);
   if(!c.name.startsWith('self-'))await probe(c.name+'/delete-action',`DELETE FROM ${targetTable};`,p.deleteAction==='NO_ACTION'?547:0);
  }
 }
 await sql('umf_relationships',`CREATE TABLE dbo.RelParent (id bigint NOT NULL PRIMARY KEY, code bigint NOT NULL UNIQUE);
 CREATE TABLE dbo.Untrusted (id bigint NOT NULL, parent bigint NULL);
 INSERT INTO dbo.Untrusted VALUES (1,999);
 ALTER TABLE dbo.Untrusted WITH NOCHECK ADD CONSTRAINT UntrustedFK FOREIGN KEY(parent) REFERENCES dbo.RelParent(code);
 CREATE TABLE dbo.Disabled (id bigint NOT NULL,parent bigint NULL CONSTRAINT DisabledFK REFERENCES dbo.RelParent(id));
 ALTER TABLE dbo.Disabled NOCHECK CONSTRAINT DisabledFK;
 CREATE TABLE dbo.CompositeParent (a bigint NOT NULL,b bigint NOT NULL,UNIQUE(a,b));
 CREATE TABLE dbo.CompositeChild (a bigint NULL,b bigint NULL,CONSTRAINT CompositeFK FOREIGN KEY(a,b) REFERENCES dbo.CompositeParent(a,b));`);
 await probe('untrusted-new-orphan','INSERT INTO dbo.Untrusted VALUES (2,998);',547);await probe('disabled-orphan','INSERT INTO dbo.Disabled VALUES (1,999);',0);await probe('native-partial-null-bypass','INSERT INTO dbo.CompositeChild VALUES (NULL,999);',0);
 const query=await Bun.file('native/sqlserver/catalog-v3.sql').text(),capture=(await json(query)).value;capture.query=query;capture.unknownRelationshipMetadata={retained:'untouched'};assert.equal(capture.serverVersion,'16.0.4295.3');
 for(const r of receipts){const fkTable=capture.tables.find((t:any)=>t.schema===r.request.namespace&&t.name===(r.request.junction?.tableName??'Source')),fk=fkTable.foreign_keys.find((f:any)=>f.name===r.request.constraintName);assert.ok(fk);assert.equal(fk.is_disabled,false);assert.equal(fk.is_not_trusted,false);assert.equal(fk.delete_action,r.request.deleteAction);assert.equal(fk.update_action,r.request.updateAction);assert.deepEqual(fk.columns.map((x:any)=>x.column_name),r.request.referenceColumns);assert.deepEqual(fk.columns.map((x:any)=>x.referenced_column_name),r.request.targetKey.columns.map(x=>x.name));}
 const sourceText=JSON.stringify(capture,null,2).replace('"unknownRelationshipMetadata": {','"unknownNumber": 9007199254740993,\n  "unknownRelationshipMetadata": {')+'\n',doc=importSqlServerCatalog(sourceText,{id:'native-relationships'}),classified=classifySqlServerRelationships(doc,{nativeSource:sourceText,mode:'report',profile:'captured-foreign-keys'});assert.equal(classified.status,'classified');assert.equal(recoverSqlServerRelationshipSource(classified,classified.target!),sourceText);
 const paths=['scripts/core-ideals/relationship-sqlserver-oracle.ts','scripts/core-ideals/relationship-sqlserver-cases.ts','src/core-ideals/relationship-sqlserver-projection.ts','src/core-ideals/relationship-sqlserver.ts','spec/core/relationship-sqlserver-projection.schema.json','spec/core/sqlserver-relationship-classification.schema.json','native/sqlserver/catalog-v3.sql'];const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/relationship-sqlserver-native.json',JSON.stringify({scope:'Qualified generated integer-key FK and junction tables with native enforcement/refinement counterexamples; no native equivalence',image,serverVersion:capture.serverVersion,projected:receipts.length,blocked:relationshipSqlServerCases().length-receipts.length,rows,sourceText,observations:classified.observations.length,sha256},null,2)+'\n');console.log(JSON.stringify({projected:receipts.length,probes:rows.length,observations:classified.observations.length}));
}finally{if(created)await run(['docker','rm','-f','-v',name]);}
