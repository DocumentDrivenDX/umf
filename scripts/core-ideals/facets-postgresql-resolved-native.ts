import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFacetNodeTree,decodeFacetConstant,type PgFacetNode} from '../../src/adapters/postgresql/facet-node-tree';
const paths=['native/postgresql/catalog/image.json','scripts/core-ideals/facets-postgresql-resolved-native.ts','src/adapters/postgresql/facet-node-tree.ts'];
const manifest=await Bun.file(paths[0]!).json(),name='umf-facet-datums-'+randomUUID();let created=false;
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);assert.equal(code,0,err||out);return out;}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(text:string)=>exec(['psql','-X','-q','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],text);
const cases:[string,string,string|null][]=[
 ['bigint','1','1'],['bigint','9223372036854775807','9223372036854775807'],['bigint','-9223372036854775808','-9223372036854775808'],
 ['numeric','0','0'],['numeric','1.2300','1.23'],['numeric','-999.99','-999.99'],['numeric','0.00001','0.00001'],
 ['numeric','0.'+'0'.repeat(63)+'1','0.'+'0'.repeat(63)+'1'],
 ['numeric','1'+'0'.repeat(260),'1'+'0'.repeat(260)],
 ['numeric','999999999999999999999999999999.999999999999999999','999999999999999999999999999999.999999999999999999'],
 ['numeric',"'NaN'",null],['numeric',"'Infinity'",null],['numeric',"'-Infinity'",null],
];
try{
 assert.match(manifest.reference,/^postgres@sha256:[0-9a-f]{64}$/);
 await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',manifest.reference]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{assert.equal((await exec(['cat','/proc/1/comm'])).trim(),'postgres');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}assert.ok(ready);
 assert.equal((await sql('SHOW server_version_num')).trim(),'170004');assert.equal((await sql('SHOW server_encoding')).trim(),'UTF8');
 const rows=[];
 for(const [type,literal,expected] of cases){
  const raw=JSON.parse(await sql(`CREATE TEMP TABLE probe(value ${type} CHECK(value <= '${literal.replaceAll("'","")}'::${type})); SELECT jsonb_build_object('nodeTree',conbin::text,'expression',pg_get_expr(conbin,conrelid,false)) FROM pg_constraint WHERE conrelid='probe'::regclass;`));
  const node=readFacetNodeTree(raw.nodeTree);assert.ok(node);const args=node.fields.args;assert.ok(Array.isArray(args));const constant=args[1] as PgFacetNode;
  if(rows.length===0)assert.deepEqual(constant.fields.constvalue,['8',['1','0','0','0','0','0','0','0']],'Native Datum ABI must be little endian and 64 bit');
  const actual=decodeFacetConstant(constant)??null;assert.equal(actual,expected,literal);rows.push({type,literal,expected,actual,...raw});
 }
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-postgresql-resolved-native.json',JSON.stringify({scope:'Native constant decoding for PostgreSQL 17.4 little-endian Datum64; finite values exact, specials refused',serverVersion:170004,encoding:'UTF8',datumFormat:'little-endian-datum64',image:manifest.reference,rows,sha256},null,2)+'\n');console.log(JSON.stringify({cases:rows.length,decoded:rows.filter(r=>r.actual!==null).length,refused:rows.filter(r=>r.actual===null).length}));
}finally{if(created)await run(['docker','rm','-f',name]);}
