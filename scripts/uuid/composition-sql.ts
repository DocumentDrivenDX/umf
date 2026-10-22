// SPDX-License-Identifier: MIT OR Apache-2.0
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {resolveBit128ModelSources} from '../../src/projections/bit128-model';
import {decodeBit128Record} from '../../src/extensions/binding/bit128-record';
import {validateBit128Dataset} from '../../src/extensions/binding/model-dataset';
import {bit128SqlServerSessionStatements} from '../../src/projections/bit128-sql-model';
const input=await Bun.file('fixtures/validation/uuid/composition-artifacts.json').json(),observations=[];
const system=process.argv[2];if(!['postgresql','sqlserver'].includes(system!))throw Error('Select SQL target');
const pg=system==='postgresql',name='umf-composition-'+randomUUID(),password='Comp!'+randomUUID();let created=false;
async function command(args:string[],stdin?:string){const p=Bun.spawn(args,{stdin:stdin===undefined?'ignore':new Blob([stdin]),stdout:'pipe',stderr:'pipe'}),timer=setTimeout(()=>p.kill(),90_000);try{const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error('Native command: '+out+' '+err);return out.trim();}finally{clearTimeout(timer);}}
const raw=(text:string)=>pg?command(['docker','exec','-i',name,'psql','-X','-q','-U','postgres','-At','-v','ON_ERROR_STOP=1'],text):command(['docker','exec','-i','-e','SQLCMDPASSWORD='+password,name,'/opt/mssql-tools18/bin/sqlcmd','-C','-S','localhost','-U','sa','-b','-h','-1','-y','8000','-w','65000'],'SET NOCOUNT ON;'+bit128SqlServerSessionStatements.join(' ')+'\n'+text+'\nGO\n');
const q=(s:string)=>pg?'"'+s+'"':'['+s+']';const text=(s:string)=>(pg?'':'N')+"'"+s.replaceAll("'","''")+"'";
try{
 await command(['docker','run','--pull=never',...(pg?[]:['--platform','linux/amd64']),'-d','--name',name,'--label','umf.uuid-composition='+name,...(pg?['-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17.9']:['-e','ACCEPT_EULA=Y','-e','MSSQL_SA_PASSWORD='+password,'mcr.microsoft.com/mssql/server:2022-latest'])]);created=true;
 let version='';for(let i=0,deadline=Date.now()+90_000;i<120&&Date.now()<deadline;i++){try{version=await raw(pg?'SELECT version();':"SELECT CAST(SERVERPROPERTY('ProductVersion') AS varchar(100));");break;}catch{await Bun.sleep(500);}}if(!version)throw Error('Native readiness timeout');
 for(const c of input.cases.filter((c:any)=>c.system===system)){
  const {layout}=resolveBit128ModelSources(c.binding,c.logical),rows:any[]=[];let negative=0;
  await raw(c.report.candidate.text);
  function insert(table:string,row:Record<string,string|null>){const record=layout.records.find(r=>r.table===table)!;return `INSERT INTO ${q(table)} (${Object.keys(row).map(q).join(',')}) VALUES (`+Object.entries(row).map(([n,v])=>{if(v===null)return 'NULL';const f=record.fields.find(f=>f.slots.includes(n))!;if(f.carrier.kind==='words64')return v;if(f.carrier.kind==='bytes16'||f.carrier.kind==='scalar'&&f.field.scalarType==='binary')return pg?`decode('${v}','hex')`:'0x'+v;if(f.carrier.kind==='scalar'&&f.field.scalarType==='boolean')return pg?v:v==='true'?'1':'0';return text(v);}).join(',')+');';}
  for(const population of c.records){const r=layout.records.find(r=>r.identity.module===population.record.module&&r.identity.element===population.record.element)!;for(const row of population.rows)await raw(insert(r.table,row));}
  for(const population of c.records){const r=layout.records.find(r=>r.identity.module===population.record.module&&r.identity.element===population.record.element)!;
   const terms=r.fields.flatMap(f=>f.slots.map(n=>{const col=q(n);return (f.carrier.kind==='bytes16'||f.carrier.kind==='scalar'&&f.field.scalarType==='binary'?pg?`encode(${col},'hex')`:`LOWER(CONVERT(varchar(max),${col},2))`:f.carrier.kind==='scalar'&&f.field.scalarType==='boolean'?pg?`${col}::text`:`CASE WHEN ${col}=1 THEN 'true' WHEN ${col}=0 THEN 'false' ELSE NULL END`:pg?`${col}::text`:`CONVERT(nvarchar(max),${col})`)+` AS ${col}`;}));
   const query=pg?`SELECT COALESCE(json_agg(r)::text,'[]') FROM (SELECT ${terms.join(',')} FROM ${q(r.table)}) r;`:`SELECT ${terms.join(',')} FROM ${q(r.table)} FOR JSON PATH,INCLUDE_NULL_VALUES`;
   const output=await raw(pg?query:`DECLARE @v nvarchar(max)=(${query});DECLARE @i int=1;WHILE @i<=LEN(@v) BEGIN PRINT N'UMF_BEGIN'+SUBSTRING(@v,@i,200)+N'UMF_END';SET @i+=200;END;`);
   const tokens=JSON.parse(pg?output:[...output.matchAll(/UMF_BEGIN([\s\S]*?)UMF_END/g)].map(m=>m[1]).join(''));
   for(const token of tokens){if(r.table==='children'){assert.equal(token.count,'-9223372036854775808');assert.equal(token.price,'1234567890123456.7890');assert.equal(token.label,"雪 O'Brien");assert.equal(token.blob,'00ff80');assert.equal(token.wide,'340282366920938463463374607431768211455');assert.equal(token.ratio,'-0');assert.equal(token.observed,'2026-10-16T12:34:56.123456789+05:30');assert.equal(token.id_hi,'-1');assert.equal(token.id_lo,'-1');}
    rows.push({record:r.identity,row:decodeBit128Record(c.binding,c.logical,r.identity,token)});
   }
  }
  const data=layout.records.map(r=>({record:r.identity,rows:rows.filter(x=>x.record.module===r.identity.module&&x.record.element===r.identity.element).map(x=>x.row)}));validateBit128Dataset(c.binding,c.logical,data);
  const refuse=async(sql:string)=>{let failed=false;try{await raw(sql);}catch{failed=true;}assert.ok(failed,'Native refusal expected');negative++;};
  await refuse(insert('parents',c.records[0].rows[0]));
  if(c.stage.startsWith('associations')){const link={...c.records[2].rows[0],linkId_hi:'123',linkId_lo:'123',right_hi:'77',right_lo:'77'};await refuse(insert('links',link));}
  if(c.stage==='associations-polymorphic')await refuse('UPDATE links SET '+q('alt_hi')+'=-1, '+q('alt_lo')+'=-1 WHERE '+q('left_hi')+' IS NOT NULL;');
  if(c.stage!=='mixed')await refuse(`UPDATE children SET ${q('itemMap')} = ${text('{bad')};`);
  let nestedExternalValueAcceptedAndCodecRefused=false;if(c.stage!=='mixed'){const bad='{"values":[{"hi":"1"}]}';await raw('UPDATE children SET '+q('itemMap')+'='+text(bad)+';');const returned=await raw('SELECT '+q('itemMap')+(pg?'::text':'')+' FROM children;');assert.throws(()=>decodeBit128Record(c.binding,c.logical,{module:'m',element:'child'},{...c.records[1].rows[0],itemMap:returned}));nestedExternalValueAcceptedAndCodecRefused=true;await raw('UPDATE children SET '+q('itemMap')+'='+text(c.records[1].rows[0].itemMap)+';');}
  const countBefore=await raw('SELECT COUNT(*) FROM children;');await raw((pg?'BEGIN;':'BEGIN TRANSACTION;')+'DELETE FROM '+(c.stage.startsWith('associations')?'links; DELETE FROM ':'')+'children; ROLLBACK;');assert.equal(await raw('SELECT COUNT(*) FROM children;'),countBefore);
  let catalog:string|null=null;if(!pg){const query=(await Bun.file('native/sqlserver/catalog-v3.sql').text()).replace('SET NOCOUNT ON;','').trim().replace(/;$/,'');const captured=await raw(`DECLARE @v nvarchar(max)=(${query});DECLARE @i int=1;WHILE @i<=LEN(@v) BEGIN PRINT N'UMF_BEGIN'+SUBSTRING(@v,@i,200)+N'UMF_END';SET @i+=200;END;`);catalog=[...captured.matchAll(/UMF_BEGIN([\s\S]*?)UMF_END/g)].map(m=>m[1]).join('');JSON.parse(catalog);}
  observations.push({system,stage:c.stage,version,catalog,nestedExternalValueAcceptedAndCodecRefused,ddlSha256:createHash('sha256').update(c.report.candidate.text).digest('hex'),records:data,independentScalarAndUuidChecks:true,negativeControls:negative,rollback:true});
  for(const r of [...layout.records].reverse())await raw('DROP TABLE '+q(r.table)+';');
 }
 await Bun.write('fixtures/validation/uuid/composition-'+system+'.json',JSON.stringify({system,inputSha256:createHash('sha256').update(new Uint8Array(await Bun.file('fixtures/validation/uuid/composition-artifacts.json').arrayBuffer())).digest('hex'),observations},null,2)+'\n');console.log({system,stages:observations.length});
}finally{if(created){const label=await command(['docker','inspect','-f','{{ index .Config.Labels "umf.uuid-composition" }}',name]);if(label===name)await command(['docker','rm','-f',name]);}}
