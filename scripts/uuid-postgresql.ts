import {encodeBit128CarrierValue} from '../src/extensions/binding/bit128';
import {randomUUID,createHash} from 'node:crypto';
import {uuidBinding,uuidDocument,FIELD} from '../tests/helpers/uuid-fixtures';
import {projectBit128CarrierSchema} from '../src/projections/bit128';
import oracle from '../fixtures/validation/uuid/bit128-oracle.json';
const name='umf-uuid-'+randomUUID(),label='umf.uuid-qualification='+name;
async function command(args:string[],stdin?:string){
 const child=Bun.spawn(args,{stdin:stdin===undefined?'ignore':new Blob([stdin]),stdout:'pipe',stderr:'pipe'});
 const timer=setTimeout(()=>child.kill(),60_000);
 try{const [stdout,stderr,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);if(code)throw Error(args.slice(0,3).join(' ')+': '+stderr);return stdout;}finally{clearTimeout(timer);}
}
let created=false;
try{
 await command(['docker','run','--pull=never','-d','--name',name,'--label',label,'-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17.9']);created=true;
 let ready=false;for(let i=0;i<100;i++){try{if((await command(['docker','exec',name,'cat','/proc/1/comm'])).trim()!=='postgres')throw Error('Native initialization still running');await command(['docker','exec',name,'pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(100);}}if(!ready)throw Error('Native PostgreSQL not ready');
 const version=(await command(['docker','exec',name,'psql','-U','postgres','-Atc','SELECT version()'])).trim();
 const sql=(text:string)=>command(['docker','exec','-i',name,'psql','-X','-q','-U','postgres','-At','-v','ON_ERROR_STOP=1'],text);
 const cases=[];
 for(const kind of ['native-uuid','bytes16','uuid-text','words64']){
  const binding=uuidBinding(kind);(binding.extensions!['umf.binding'] as any).target={system:'postgresql',version:'17',subset:'uuid-carrier1'};
  const projection=projectBit128CarrierSchema(binding,uuidDocument(),FIELD,{lossPolicy:'strict',obligations:['bits']});
  if(!projection.candidate)throw Error('No generated artifact');
  const values=oracle.cases.map(r=>{const slots=encodeBit128CarrierValue(binding,uuidDocument(),FIELD,{uuid:r.uuid});return kind==='words64'?`(${slots.hi},${slots.lo})`:kind==='bytes16'?`(decode('${slots.id}','hex'))`:`('${slots.id}')`;}).join(',');
  const expr=kind==='words64'?`lpad(to_hex(hi),16,'0') || lpad(to_hex(lo),16,'0')`:kind==='bytes16'?`encode(id,'hex')`:`replace(id::text,'-','')`;
  const result=await sql(projection.candidate.text+`\nINSERT INTO records VALUES ${values};\nSELECT ${expr} AS bits FROM records ORDER BY bits;\n`);
  const actual=result.trim().split('\n'),expected=oracle.cases.map(r=>r.hex).sort();
  if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error('Native bits differ: '+kind);
  const catalog=JSON.parse((await sql(`SELECT json_agg(json_build_object('name',a.attname,'type',t.typname,'required',a.attnotnull) ORDER BY a.attnum) FROM pg_attribute a JOIN pg_type t ON a.atttypid=t.oid WHERE a.attrelid='records'::regclass AND a.attnum>0 AND NOT a.attisdropped;`)).trim());
  const expectedCatalog=(kind==='words64'?['hi','lo']:['id']).map(name=>({name,type:kind==='words64'?'int8':kind==='native-uuid'?'uuid':kind==='bytes16'?'bytea':'varchar',required:true}));
  if(JSON.stringify(catalog)!==JSON.stringify(expectedCatalog))throw Error('Native catalog differs from independent expectations');
  const equality=(await sql('SELECT count(*) FROM records;')).trim();if(equality!==String(oracle.cases.length))throw Error('Population mismatch');
  let widthRefusal=false;
  if(kind==='words64'){try{await sql(`INSERT INTO records VALUES (9223372036854775808,0);`);}catch{widthRefusal=true;}if(!widthRefusal)throw Error('Native overflow not refused');}
  cases.push({kind,vectors:actual.length,sourceSha256:createHash('sha256').update(projection.candidate.text).digest('hex'),catalog,widthRefusal:kind==='words64'?widthRefusal:null});
  await sql('DROP TABLE records;');
 }
 // Compare portable unsigned order with signed pair order across a high-bit boundary.
 const signedOrder=(await sql(`SELECT x FROM (VALUES ('-9223372036854775808'::bigint),(9223372036854775807::bigint)) AS t(x) ORDER BY x;`)).trim().split('\n');
 if(signedOrder[0]!=='-9223372036854775808')throw Error('Missing signed-order counterexample');
 const evidence={scope:'Actual owned PostgreSQL17.9 required singular generated carrier DDL, catalog and full-bit value recovery; signed ordering is explicitly different; no full binding/key/relationship/atomicity qualification',version,cases,signedOrderCounterexample:signedOrder,checks:cases.reduce((n,c)=>n+c.vectors,0)};
 await Bun.write('fixtures/validation/uuid/postgresql.json',JSON.stringify(evidence,null,2)+'\n');console.log({version,checks:evidence.checks,carriers:cases.length});
}finally{
 if(created){const actual=await command(['docker','inspect','--format','{{index .Config.Labels "umf.uuid-qualification"}}',name]);if(actual.trim()!==name)throw Error('Owned native fixture label mismatch');await command(['docker','rm','-f',name]);}
}
