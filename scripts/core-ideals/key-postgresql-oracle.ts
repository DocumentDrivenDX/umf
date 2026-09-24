import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {backend} from '../../native/postgresql/runtime';
import {postgresqlKeyProjectionCases} from './key-postgresql-projection-cases';
import {projectKeysToPostgresql} from '../../src/core-ideals/key-postgresql-projection';
import {identifier,literal} from '../../src/core-ideals/postgresql-syntax';
const name='umf-key-projection-'+randomUUID();let created=false;
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);assert.equal(code,0,err||out);return out;}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(text:string)=>exec(['psql','-X','-q','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],text);
const manifest=await Bun.file('native/postgresql/catalog/image.json').json(),query=await Bun.file('native/postgresql/keys/query.sql').text(),rows:any[]=[];
try{
 assert.match(manifest.reference,/^postgres@sha256:[0-9a-f]{64}$/);await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',manifest.reference]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{assert.equal((await exec(['cat','/proc/1/comm'])).trim(),'postgres');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}assert.ok(ready);assert.equal((await sql('SHOW server_version_num')).trim(),'170004');assert.equal((await sql('SHOW server_encoding')).trim(),'UTF8');
 const helper=`CREATE FUNCTION pg_temp.probe(statement text) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE value text; BEGIN EXECUTE statement INTO STRICT value; RETURN jsonb_build_object('sqlstate','00000','value',value); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('sqlstate',SQLSTATE,'value',NULL); END $$;`;
 for(const c of postgresqlKeyProjectionCases()){
  const r=await projectKeysToPostgresql(c.source,c.authors,c.request,backend);assert.equal(r.status,c.expected);if(r.status==='blocked'){rows.push({name:c.name,status:r.status});continue;}
  const namespace=identifier(c.request.namespace),table=namespace+'.'+identifier(c.request.tableName);await sql(`DROP SCHEMA IF EXISTS ${namespace} CASCADE; CREATE SCHEMA ${namespace};\n`+r.nativeSql!);
  const indexes=JSON.parse(await sql(query));assert.equal(indexes.length,r.mappings.length);for(const mapping of r.mappings){const index=indexes.find((i:any)=>i.index===mapping.constraintName);assert.ok(index);assert.equal(index.primary,mapping.primary);assert.equal(index.unique,true);assert.equal(index.immediate,true);assert.equal(index.constraint.deferrable,false);assert.equal(index.predicate,null);assert.ok(index.components.every((p:any)=>p.notNull));assert.deepEqual(index.components.map((p:any)=>p.name),mapping.columns);}
  const family=c.source.modules[0]!.elements[1]!.scalarType!;
  const values=family==='boolean'?['false','true']:family==='binary'?["decode('01','hex')","decode('02','hex')"]:family==='string'?["'a'","'b'"]:family==='decimal'?['1.23','2.34']:['1','2'];
  const probes:any[]=[];
  const probe=async(id:string,value:string,code:string,state='00000')=>{const statement=`INSERT INTO ${table} VALUES(${value},${code}) RETURNING 'accepted'::text`,actual=JSON.parse((await sql(helper+'\nSELECT pg_temp.probe('+literal(statement)+');')).trim());assert.deepEqual(actual,{sqlstate:state,value:state==='00000'?'accepted':null},c.name+': '+id);probes.push({id,statement,...actual});};
  await probe('positive-control',values[0]!,"'codeA'");await probe('duplicate-tuple',values[0]!,"'codeA'",'23505');await probe('required-first-component','NULL',"'codeX'",'23502');await probe('required-alternate-component',values[1]!,'NULL','23502');await probe('alternate-duplicate',values[1]!,"'codeA'",'23505');
  if(r.mappings.some(m=>m.columns.length===1&&m.columns[0]===c.request.columns[0]!.name))await probe('first-key-duplicate',values[0]!,"'codeX'",'23505');
  await probe('distinct-tuples',values[1]!,"'codeB'");
  if(c.name==='decimal')for(const [id,value,state] of [['trailing-zero-same-identity','1.2300','23505'],['no-rounding','1.235','23514'],['nan',"'NaN'",'23514'],['infinity',"'Infinity'",'23514'],['precision-overflow','1000','23514']])await probe(id!,value!,"'codeX'",state);
  if(c.name==='integer-width'){await probe('width-upper','128',"'codeX'",'23514');await probe('fraction','1.5',"'codeX'",'23514');}
  if(c.name==='unsigned'){await probe('unsigned-upper','18446744073709551616',"'codeX'",'23514');await probe('unsigned-negative','-1',"'codeX'",'23514');await probe('unsigned-max','18446744073709551615',"'codeX'");}
  if(c.name==='string-length'){await probe('length-overflow',"'abcd'","'codeX'",'23514');await probe('unicode-scalar-length',"'😀ab'","'codeX'");}
  if(c.name==='binary-length')await probe('byte-length-overflow',"decode('00010203','hex')","'codeX'",'23514');
  if(c.name==='primary-report'){await probe('trailing-space-distinct','3',"'codeA '");await probe('precomposed-distinct','4',"U&'\\00E9'");await probe('decomposed-distinct','5',"U&'e\\0301'");await probe('native-nul-restriction','6','chr(0)','54000');await probe('native-index-tuple-size','6',"(SELECT string_agg(md5(i::text),'') FROM generate_series(1,300) AS g(i))",'54000');await probe('input-coercion-before-constraint','1.2::numeric',"'codeX'",'23505');}
  rows.push({name:c.name,status:r.status,nativeSql:r.nativeSql,indexes,probes});
 }
 const paths=['native/postgresql/catalog/image.json','native/postgresql/keys/query.sql','scripts/core-ideals/key-postgresql-oracle.ts','scripts/core-ideals/key-postgresql-projection-cases.ts','src/core-ideals/key-postgresql-projection.ts','scripts/core-ideals/key-postgresql-projection-schema.ts','spec/core/key-postgresql-projection.schema.json'];
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/key-postgresql-projection-native.json',JSON.stringify({scope:'Pinned generated PostgreSQL key DDL, constraint catalog and actual insertion controls; stored values only, no general input-conversion, descendant or deployed-state guarantee; separate discovery evidence covers native counterexamples outside emitted DDL',serverVersion:170004,image:manifest.reference,references:['https://www.postgresql.org/docs/17/limits.html','https://www.postgresql.org/docs/17/datatype-numeric.html','https://www.postgresql.org/docs/17/ddl-system-columns.html'],rows,sha256},null,2)+'\n');console.log(JSON.stringify({cases:rows.length,projected:rows.filter(r=>r.status==='projected').length,probes:rows.flatMap(r=>r.probes??[]).length}));
}finally{if(created)await run(['docker','rm','-f',name]);}
