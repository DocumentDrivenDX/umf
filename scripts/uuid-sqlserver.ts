import {encodeBit128CarrierValue} from '../src/extensions/binding/bit128';
import {randomUUID,createHash} from 'node:crypto';
import {uuidBinding,uuidDocument,FIELD} from '../tests/helpers/uuid-fixtures';
import {projectBit128CarrierSchema} from '../src/projections/bit128';
import oracle from '../fixtures/validation/uuid/bit128-oracle.json';
const name='umf-uuid-sqlserver-'+randomUUID(),password='Uuid-Test!'+randomUUID(),label='umf.uuid-qualification='+name;
async function command(args:string[],stdin?:string){const child=Bun.spawn(args,{stdin:stdin===undefined?'ignore':new Blob([stdin]),stdout:'pipe',stderr:'pipe'});const timer=setTimeout(()=>child.kill(),90_000);try{const [stdout,stderr,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);if(code)throw Error(args.slice(0,3).join(' ')+': '+stderr+' '+stdout);return stdout;}finally{clearTimeout(timer);}}
const sql=(text:string)=>command(['docker','exec','-i','-e','SQLCMDPASSWORD='+password,name,'/opt/mssql-tools18/bin/sqlcmd','-C','-S','localhost','-U','sa','-b','-h','-1','-W','-w','65000'], 'SET NOCOUNT ON;\n'+text+'\nGO\n');
let created=false;
try{
 await command(['docker','run','--pull=never','--platform','linux/amd64','-d','--name',name,'--label',label,'-e','ACCEPT_EULA=Y','-e','MSSQL_SA_PASSWORD='+password,'mcr.microsoft.com/mssql/server:2022-latest']);created=true;
 let version='';for(let i=0;i<120;i++){try{version=(await sql("SELECT CAST(SERVERPROPERTY('ProductVersion') AS varchar(100));")).trim();break;}catch{await Bun.sleep(500);}}if(!version)throw Error('SQL Server readiness failed');
 const cases=[];
 for(const kind of ['native-uuid','bytes16','uuid-text','words64']){
  console.log({checking:kind});
  const binding=uuidBinding(kind);(binding.extensions!['umf.binding'] as any).target={system:'sqlserver',version:'2022',subset:'uuid-carrier1'};
  const report=projectBit128CarrierSchema(binding,uuidDocument(),FIELD,{lossPolicy:'strict',obligations:['bits']});if(!report.candidate)throw Error('No generated artifact');
  const values=oracle.cases.map(v=>{const slots=encodeBit128CarrierValue(binding,uuidDocument(),FIELD,{uuid:v.uuid});return kind==='words64'?`(${slots.hi},${slots.lo})`:kind==='bytes16'?`(0x${slots.id})`:`('${slots.id}')`;}).join(',\n');
  const expr=kind==='words64'?`LOWER(CONVERT(varchar(16),CONVERT(binary(8),hi),2)+CONVERT(varchar(16),CONVERT(binary(8),lo),2))`:kind==='bytes16'?`LOWER(CONVERT(varchar(32),id,2))`:`LOWER(REPLACE(CONVERT(varchar(36),id),'-',''))`;
  if(kind==='native-uuid'){const rejected=await sql(`SELECT v FROM (VALUES ${oracle.cases.map(v=>"('"+v.uuid+"')").join(',\n')}) AS probe(v) WHERE TRY_CONVERT(uniqueidentifier,v) IS NULL;`);console.log({rejectedUuidText:rejected.trim()});}
  const raw=await sql(report.candidate.text+`\nINSERT INTO records VALUES ${values};\nSELECT ${expr} AS bits FROM records ORDER BY bits;`);
  const actual=raw.trim().split(/\r?\n/).map(s=>s.trim()).filter(Boolean),expected=oracle.cases.map(v=>v.hex).sort();if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Native bits differ: '+kind);
  const catalog=(await sql("SELECT name,TYPE_NAME(system_type_id) AS type,is_nullable FROM sys.columns WHERE object_id=OBJECT_ID('records') ORDER BY column_id FOR JSON PATH;")).trim();
  const observedCatalog=JSON.parse(catalog),expectedCatalog=(kind==='words64'?['hi','lo']:['id']).map(name=>({name,type:kind==='words64'?'bigint':kind==='native-uuid'?'uniqueidentifier':kind==='bytes16'?'varbinary':'varchar',is_nullable:false}));
  if(JSON.stringify(observedCatalog)!==JSON.stringify(expectedCatalog))throw Error('Native catalog differs from independent expected types/availability');
  let overflowRefused=false;if(kind==='words64'){try{await sql('INSERT INTO records VALUES (9223372036854775808,0);');}catch{overflowRefused=true;}if(!overflowRefused)throw Error('Native overflow accepted');}
  cases.push({kind,vectors:actual.length,catalog:JSON.parse(catalog),sourceSha256:createHash('sha256').update(report.candidate.text).digest('hex'),overflowRefused:kind==='words64'?overflowRefused:null});await sql('DROP TABLE records;');
 }
 const nativeOrder=(await sql("SELECT CONVERT(varchar(36),id) FROM (VALUES (CONVERT(uniqueidentifier,'00000000-0000-0000-0000-000000000001')),(CONVERT(uniqueidentifier,'01000000-0000-0000-0000-000000000000'))) AS t(id) ORDER BY id;")).trim().split(/\r?\n/).map(s=>s.trim());
 if(nativeOrder[0]!=='01000000-0000-0000-0000-000000000000')throw Error('Native order counterexample missing');
 const evidence={scope:'Actual owned SQL Server2022 generated required singular schemas and all-bit value recovery; no full binding, nullable pair, key or atomicity qualification',version,cases,nativeOrderCounterexample:nativeOrder,checks:cases.reduce((n,c)=>n+c.vectors,0)};
 await Bun.write('fixtures/validation/uuid/sqlserver.json',JSON.stringify(evidence,null,2)+'\n');console.log({version,carriers:cases.length,checks:evidence.checks});
}finally{if(created){const actual=await command(['docker','inspect','--format','{{index .Config.Labels "umf.uuid-qualification"}}',name]);if(actual.trim()!==name)throw Error('Native fixture ownership mismatch');await command(['docker','rm','-f',name]);}}
