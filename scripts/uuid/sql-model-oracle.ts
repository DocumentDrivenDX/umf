/** Host-only owned-fixture qualification of public model projection/row codecs. */
import {randomUUID,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {uuidModel,PARENT,CHILD} from '../../tests/helpers/uuid-model-fixtures';
import {bit128SqlServerSessionStatements} from '../../src/projections/bit128-sql-model';
import {projectBit128Model,recoverBit128ModelProjection} from '../../src/projections/bit128-model';
import {encodeBit128Record,decodeBit128Record} from '../../src/extensions/binding/bit128-record';
import {classifyBit128NativeType} from '../../src/projections/bit128';
import oracle from '../../fixtures/validation/uuid/bit128-oracle.json';
const system=process.argv[2];if(system!=='postgresql'&&system!=='sqlserver')throw Error('Select postgresql or sqlserver');
const pg=system==='postgresql',name='umf-uuid-model-'+randomUUID(),label='umf.uuid-model='+name,password='Uuid-Model!'+randomUUID();
async function command(args:string[],stdin?:string){const p=Bun.spawn(args,{stdin:stdin===undefined?'ignore':new Blob([stdin]),stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>p.kill(),90_000);try{const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error('Native command failed: '+err+' '+out);return out.trim();}finally{clearTimeout(timer);}}
const sqlRaw=(text:string)=>pg?command(['docker','exec','-i',name,'psql','-X','-q','-U','postgres','-At','-v','ON_ERROR_STOP=1'],text):command(['docker','exec','-i','-e','SQLCMDPASSWORD='+password,name,'/opt/mssql-tools18/bin/sqlcmd','-C','-S','localhost','-U','sa','-b','-h','-1','-y','8000','-w','65000'],'SET NOCOUNT ON; '+bit128SqlServerSessionStatements.join(' ')+'\n'+text+'\nGO\n');
const sql=async(text:string)=>{const result=await sqlRaw(text);return pg?result:result.split(/\r?\n/).map(s=>s.trim()).join('');};
const vectors=[...new Map(oracle.cases.map(v=>[v.hex,v])).values()];
const nativeArchives:any[]=[];
const cases:any[]=[];let created=false;
try{
 await command(['docker','run','--pull=never',...(pg?[]:['--platform','linux/amd64']),'-d','--name',name,'--label',label,...(pg?['-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17.9']:['-e','ACCEPT_EULA=Y','-e','MSSQL_SA_PASSWORD='+password,'mcr.microsoft.com/mssql/server:2022-latest'])]);created=true;
 let version='',lastError:unknown;for(let i=0,deadline=Date.now()+90_000;i<120&&Date.now()<deadline;i++){try{if(pg&&(await command(['docker','exec',name,'cat','/proc/1/comm']))!=='postgres')throw Error('Still initializing');version=await sql(pg?'SELECT version();':"SELECT CAST(SERVERPROPERTY('ProductVersion') AS varchar(100));");break;}catch(error){lastError=error;if(String(error).includes('options are mutually exclusive')||String(error).includes('value must be greater'))throw error;await Bun.sleep(400);}}if(!version)throw lastError;
 for(const domain of ['uuid','bits128'])for(const kind of domain==='uuid'?['native-uuid','bytes16','uuid-text','words64']:['bytes16','hex128-text','words64']){
  console.log({system,domain,kind});
  const {logical,binding}=uuidModel(kind,system,domain),report=projectBit128Model(binding,logical,'strict');assert.equal(report.status,'projected');
  assert.equal(JSON.stringify(recoverBit128ModelProjection(report,report.candidate!.text)),JSON.stringify({logical,binding}));
  const q=(n:string)=>pg?'"'+n+'"':'['+n+']';
  const literal=(hex:string)=>domain==='uuid'?{uuid:hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20)}:{bits128Hex:hex};
  const row=(record:typeof PARENT,hex:string,absent=false,parentHex=hex)=>encodeBit128Record(binding,logical,record,record.element==='parent'?[{field:{module:'m',element:'parentId'},value:literal(hex)}]:[{field:{module:'m',element:'childId'},value:literal(hex)},{field:{module:'m',element:'parentRef'},value:absent?null:literal(parentHex)}]);
  const token=(s:string|null)=>s===null?'NULL':kind==='words64'?s:kind==='bytes16'?(pg?`decode('${s}','hex')`:'0x'+s):"'"+s+"'";
  const insert=(table:string,r:Record<string,string|null>)=>`INSERT INTO ${q(table)} (${Object.keys(r).map(q).join(',')}) VALUES (${Object.values(r).map(token).join(',')});`;
  await sql(report.candidate!.text+'\n'+vectors.map(v=>insert('parents',row(PARENT,v.hex))).join('\n')+'\n'+vectors.map((v,i)=>insert('children',row(CHILD,v.hex,false,vectors[(i+1)%vectors.length]!.hex))).join('\n'));
  const parentSlots=Object.keys(row(PARENT,vectors[0]!.hex)),childSlots=Object.keys(row(CHILD,vectors[0]!.hex));
  const select=(table:string,names:string[])=>pg?`SELECT COALESCE(json_agg(r)::text,'[]') FROM (SELECT ${names.map(n=>kind==='bytes16'?`encode(${q(n)},'hex') AS ${q(n)}`:`${q(n)}::text AS ${q(n)}`).join(',')} FROM ${q(table)}) r;`:`SELECT ${names.map(n=>kind==='bytes16'?`LOWER(CONVERT(varchar(32),${q(n)},2)) AS ${q(n)}`:`CONVERT(varchar(100),${q(n)}) AS ${q(n)}`).join(',')} FROM ${q(table)} FOR JSON PATH,INCLUDE_NULL_VALUES;`;
  const recovered=JSON.parse(await sql(select('children',childSlots))) as Record<string,string|null>[];
  const hexFrom=(value:any)=>domain==='uuid'?value.uuid.replaceAll('-',''):value.bits128Hex;
  assert.deepEqual(recovered.map(r=>hexFrom(decodeBit128Record(binding,logical,CHILD,r)[0]!.value)).sort(),vectors.map(v=>v.hex).sort());
  const rawBits=(r:Record<string,string|null>,prefix:string)=>kind==='words64'?((BigInt.asUintN(64,BigInt(r[prefix+'_hi']!))<<64n)|BigInt.asUintN(64,BigInt(r[prefix+'_lo']!))).toString(16).padStart(32,'0'):r[prefix]!.replaceAll('-','').toLowerCase();
  for(const r of recovered){const decoded=decodeBit128Record(binding,logical,CHILD,r),idHex=hexFrom(decoded[0]!.value),index=vectors.findIndex(v=>v.hex===idHex),expected=vectors[(index+1)%vectors.length]!.hex;assert.equal(rawBits(r,'id'),idHex);assert.equal(rawBits(r,'parent'),expected);assert.equal(hexFrom(decoded[1]!.value),expected);}
  const refuse=async(text:string,reason?:RegExp)=>{let refused=false;try{await sql(text);}catch(error){if(reason)assert.match(String(error),reason);refused=true;}assert.ok(refused,'Native negative control accepted');};
  await refuse(insert('parents',row(PARENT,vectors[0]!.hex)));
  const missing='0123456789abcdef0123456789abcdef';assert.ok(!vectors.some(v=>v.hex===missing));
  const orphan=row(CHILD,missing);await refuse(insert('children',orphan));
  if(kind==='words64'){const partial=row(CHILD,missing,true);partial.parent_hi='0';await refuse(insert('children',partial));}
  if(kind==='uuid-text'||kind==='hex128-text')for(const bad of ['x'.repeat(kind==='uuid-text'?36:32),String(row(PARENT,'abcdefabcdefabcdefabcdefabcdefab').id).toUpperCase(),String(row(PARENT,vectors[1]!.hex).id)+' ',String(row(PARENT,vectors[1]!.hex).id)+'\n'])await refuse(insert('parents',{id:bad}));
  if(kind==='bytes16')for(const bad of ['00','00'.repeat(17)])await refuse(insert('parents',{id:bad}));
  const nullRow=row(CHILD,missing,true);await sql(insert('children',nullRow));
  const before=JSON.parse(await sql(select('children',childSlots)));
  const replacement=row(CHILD,vectors[1]!.hex),updates=Object.entries(replacement).filter(([n])=>n.startsWith('parent')).map(([n,v])=>q(n)+' = '+token(v)).join(',');
  await sql((pg?'BEGIN;':'BEGIN TRANSACTION;')+`UPDATE ${q('children')} SET ${updates}; ROLLBACK;`);
  assert.deepEqual(JSON.parse(await sql(select('children',childSlots))),before);
  const pending=sql((pg?'BEGIN;':'BEGIN TRANSACTION;')+`/*umf_uuid_atomic_probe*/ UPDATE ${q('children')} SET ${updates}; `+(pg?'SELECT pg_sleep(5) /*umf_uuid_atomic_probe*/;':"WAITFOR DELAY '00:00:05';")+' ROLLBACK;');
  let barrier=false;for(let probe=0,deadline=Date.now()+10_000;probe<40&&Date.now()<deadline;probe++){const count=await sql(pg?"SELECT count(*) FROM pg_stat_activity WHERE wait_event='PgSleep' AND query LIKE '%umf_uuid_atomic_probe%';":"SELECT count(*) FROM sys.dm_exec_requests WHERE command='WAITFOR';");if(Number(count)>0){barrier=true;break;}await Bun.sleep(50);}
  if(!barrier){await pending;throw Error('Native writer barrier not observed');}
  const during=JSON.parse(await sql(select('children',childSlots)));await pending;
  const sorted=(rows:unknown[])=>rows.map(r=>JSON.stringify(r)).sort();assert.deepEqual(sorted(during),sorted(before));
  const catalog=JSON.parse(await sql(pg?`SELECT json_agg(json_build_object('type',contype,'arity',array_length(conkey,1))) FROM pg_constraint WHERE conrelid IN ('parents'::regclass,'children'::regclass);`:`SELECT type,name FROM sys.objects WHERE parent_object_id IN (OBJECT_ID('parents'),OBJECT_ID('children')) FOR JSON PATH;`));
  assert.ok(catalog.some((x:any)=>pg?x.type==='f'&&x.arity===parentSlots.length:x.type.trim()==='F'));
  let classification:unknown=null;
  if(kind==='native-uuid'){const definition=JSON.parse(await sql(pg?"SELECT json_build_object('schema',n.nspname,'name',t.typname,'kind',t.typtype) FROM pg_attribute a JOIN pg_type t ON a.atttypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE a.attrelid='parents'::regclass AND a.attname='id';":"SELECT s.name AS [schema],t.name,t.system_type_id AS systemTypeId FROM sys.columns c JOIN sys.types t ON c.user_type_id=t.user_type_id JOIN sys.schemas s ON t.schema_id=s.schema_id WHERE c.object_id=OBJECT_ID('parents') AND c.name='id' FOR JSON PATH,WITHOUT_ARRAY_WRAPPER;"));classification=classifyBit128NativeType({system,version:pg?'17':'2022',definition});assert.equal((classification as any).scalarType,'uuid');}
  if(!pg){const query=(await Bun.file('native/sqlserver/catalog-v3.sql').text()).replace('SET NOCOUNT ON;','').trim().replace(/;$/,'');const raw=await sqlRaw(`DECLARE @capture nvarchar(max) = (${query}); DECLARE @offset int=1; WHILE @offset<=LEN(@capture) BEGIN PRINT N'UMF_BEGIN'+SUBSTRING(@capture,@offset,200)+N'UMF_END'; SET @offset+=200; END;`);await Bun.write('/tmp/uuid-catalog.raw',raw);const chunks=[...raw.matchAll(/UMF_BEGIN([\s\S]*?)UMF_END/g)];if(!chunks.length)throw Error('No native catalog chunks');const nativeText=chunks.map(c=>c[1]).join('');JSON.parse(nativeText);nativeArchives.push({domain,kind,text:nativeText});}
  const refined=structuredClone(logical);refined.modules[0]!.elements[2]!.default={on:'missing',value:literal(vectors[0]!.hex)};refined.modules[0]!.elements[2]!.allowedValues=[literal(vectors[0]!.hex)];
  const constrained=projectBit128Model(binding,refined,'strict');assert.equal(constrained.status,'projected');
  await sql('DROP TABLE children; DROP TABLE parents;'+constrained.candidate!.text+' INSERT INTO parents DEFAULT VALUES;');
  const defaultRow=JSON.parse(await sql(select('parents',parentSlots)))[0];assert.equal(hexFrom(decodeBit128Record(binding,refined,PARENT,defaultRow)[0]!.value),vectors[0]!.hex);
  await refuse(insert('parents',row(PARENT,vectors[1]!.hex)));
  const uniqueBinding=structuredClone(binding),uniqueLogical=structuredClone(refined);(uniqueBinding.extensions!['umf.binding'] as any).indexes[0].unique=true;(uniqueLogical.modules[0]!.relationships as any)[0].sourceMultiplicity.max=1;
  const unique=projectBit128Model(uniqueBinding,uniqueLogical,'strict');assert.equal(unique.status,'projected');
  await sql('DROP TABLE children; DROP TABLE parents;'+unique.candidate!.text+' INSERT INTO parents DEFAULT VALUES;'+insert('children',row(CHILD,vectors[0]!.hex)));
  const duplicate=row(CHILD,vectors[1]!.hex);for(const n of Object.keys(duplicate).filter(n=>n.startsWith('parent')))duplicate[n]=row(CHILD,vectors[0]!.hex)[n]!;await refuse(insert('children',duplicate));
  await sql(insert('children',row(CHILD,vectors[1]!.hex,true))+insert('children',row(CHILD,vectors[2]!.hex,true)));
  if(!pg)await refuse('SET QUOTED_IDENTIFIER OFF;'+insert('children',row(CHILD,missing,true)),/1934|QUOTED_IDENTIFIER/);
  const uniqueRows=JSON.parse(await sql(select('children',childSlots)));assert.equal(uniqueRows.length,3);assert.equal(uniqueRows.map((r:any)=>decodeBit128Record(uniqueBinding,uniqueLogical,CHILD,r)[1]!.value).filter((v:any)=>v===null).length,2);
  cases.push({domain,kind,independentOracleFields:true,nullableUniqueAndReverseKey:true,literalDefaultAndAllowedValues:true,vectors:vectors.length,decodedRows:recovered.length,negativeControls:true,rollback:true,nullableRow:true,concurrentWriterBarrierObserved:barrier,readDuringUncommittedWriteMatchedCommittedRow:true,classification,catalog,ddlSha256:createHash('sha256').update(report.candidate!.text).digest('hex')});
  await sql('DROP TABLE children; DROP TABLE parents;');
 }
 const evidence={system,version,scope:'uuid-model1 complete two-Record generated DDL, all-bit data, Keys/FK/indexes, external-write controls, nullable rows and transaction rollback; full-row codec custody required; observed concurrent read during an uncommitted full-row update; arbitrary independent half updates and other isolation modes remain outside this profile',cases};
 if(!pg)await Bun.write('fixtures/validation/uuid/sqlserver-model-catalogs.json',JSON.stringify(nativeArchives)+'\n');
 await Bun.write(`fixtures/validation/uuid/${system}-model.json`,JSON.stringify(evidence,null,2)+'\n');console.log({passed:cases.length});
}finally{if(created){assert.equal(await command(['docker','inspect','--format','{{index .Config.Labels "umf.uuid-model"}}',name]),name);await command(['docker','rm','-f',name]);}}
