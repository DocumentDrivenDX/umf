/** Pinned native behavior evidence only; no portable Key binding or admission claim. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
const name='umf-key-discovery-'+randomUUID();let created=false;
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);assert.equal(code,0,err||out);return out;}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(text:string)=>exec(['psql','-X','-q','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],text);
const paths=['native/postgresql/catalog/image.json','native/postgresql/keys/query.sql','fixtures/postgresql/keys.sql','scripts/core-ideals/key-postgresql-discovery.ts'];
const manifest=await Bun.file(paths[0]!).json(),query=await Bun.file(paths[1]!).text(),ddl=await Bun.file(paths[2]!).text();
const cases:{id:string;statement:string;sqlstate:string;value:string|null}[]=[];
const add=(id:string,statement:string,value:string|null,sqlstate='00000')=>cases.push({id,statement,sqlstate,value});
const insert=(id:string,table:string,values:string,value:string|null,state='00000')=>add(id,`INSERT INTO umf_key_probe.${table} VALUES(${values}) RETURNING ${table==='enforced'?'id':table==='compound'?'tenant':'value'}::text`,value,state);
insert('primary-rejects-duplicate','enforced','1,11',null,'23505');insert('alternate-rejects-duplicate','enforced','2,10',null,'23505');
insert('primary-rejects-null','enforced','NULL,12',null,'23502');insert('alternate-rejects-null','enforced','3,NULL',null,'23502');insert('independent-key-tuples-accepted','enforced','2,20','2');
insert('partial-outside-predicate-duplicate','partial','1,false','1');insert('partial-inside-predicate-duplicate','partial','1,true',null,'23505');
insert('nullable-duplicate-null','nullable','NULL',null);insert('nullable-nonnull-duplicate','nullable','1',null,'23505');
insert('nulls-not-distinct-duplicate','nulls_equal','NULL',null,'23505');add('nulls-not-distinct-still-stores-null','SELECT count(*)::text FROM umf_key_probe.nulls_equal WHERE value IS NULL','1');
insert('text-trailing-space-distinct','exact_text',"'a '",'a ');insert('text-canonical-unicode-distinct','exact_text',"U&'e\\0301'",'é');insert('text-exact-duplicate','exact_text',"'a'",null,'23505');insert('text-empty-present','exact_text',"''",'');insert('text-nul-refused','exact_text','chr(0)',null,'54000');
insert('char-padding-collapses-distinct-ideal','padded',"'a '",null,'23505');insert('icu-case-fold-collapses-distinct-ideal','folded_text',"'A'",null,'23505');insert('icu-normalization-collapses-distinct-ideal','folded_text',"U&'e\\0301'",null,'23505');
insert('typmod-rounding-causes-duplicate','rounded','1.234',null,'23505');insert('typmod-rounding-changes-identity','rounded','1.235','1.24');insert('typmod-allows-nan','rounded',"'NaN'",'NaN');insert('nan-duplicates-compare-equal','rounded',"'NaN'",null,'23505');
insert('exact-decimal-trailing-zero-duplicate','exact_decimal','1.2300',null,'23505');insert('exact-decimal-rejects-rounding','exact_decimal','1.235',null,'23514');insert('exact-decimal-rejects-nan','exact_decimal',"'NaN'",null,'23514');insert('exact-decimal-rejects-infinity','exact_decimal',"'Infinity'",null,'23514');insert('exact-decimal-preserves-value','exact_decimal','2.200','2.200');
insert('binary-duplicate','binary',"decode('0000','hex')",null,'23505');insert('binary-distinct','binary',"decode('0001','hex')",'\\x0001');insert('boolean-duplicate','boolean','false',null,'23505');insert('boolean-distinct','boolean','true','true');
insert('compound-duplicate','compound','1,1',null,'23505');insert('compound-distinct-tuple','compound','1,2','1');insert('compound-null','compound','NULL,3',null,'23502');
insert('inherited-child-bypasses-parent-key','child','1','1');add('parent-query-includes-duplicate-child','SELECT count(*)::text FROM umf_key_probe.parent WHERE value=1','2');
insert('expression-key-collapses-distinct-column','expression',"'ABC'",null,'23505');
insert('included-column-not-key','included',"2,'same'",'2');insert('included-key-duplicate','included',"1,'different'",null,'23505');
try{
 assert.match(manifest.reference,/^postgres@sha256:[0-9a-f]{64}$/);
 await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',manifest.reference]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{assert.equal((await exec(['cat','/proc/1/comm'])).trim(),'postgres');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}assert.ok(ready);
 assert.equal((await sql('SHOW server_version_num')).trim(),'170004');assert.equal((await sql('SHOW server_encoding')).trim(),'UTF8');await sql(ddl);
 const helper=`CREATE FUNCTION pg_temp.probe(statement text) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE value text; BEGIN EXECUTE statement INTO STRICT value; RETURN jsonb_build_object('sqlstate','00000','value',value); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('sqlstate',SQLSTATE,'value',NULL); END $$;`;
 const rows=[];
 for(const row of cases){const result=JSON.parse((await sql(helper+"\nSELECT pg_temp.probe('"+row.statement.replaceAll("'","''")+"');")).trim());assert.deepEqual(result,{sqlstate:row.sqlstate,value:row.value},row.id);rows.push({...row,...result});}
 const deferred=JSON.parse(await sql(`CREATE FUNCTION pg_temp.deferred_probe() RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE n integer; state text; BEGIN BEGIN INSERT INTO umf_key_probe.deferred VALUES(1); SELECT count(*) INTO n FROM umf_key_probe.deferred; SET CONSTRAINTS ALL IMMEDIATE; EXCEPTION WHEN unique_violation THEN state:=SQLSTATE; END; RETURN jsonb_build_object('visibleBeforeCheck',n,'sqlstate',state); END $$; SELECT pg_temp.deferred_probe();`));assert.deepEqual(deferred,{visibleBeforeCheck:2,sqlstate:'23505'});
 const indexes=JSON.parse(await sql(query));assert.equal(indexes.length,17);const index=(table:string)=>indexes.find((r:any)=>r.table===table);
 assert.equal(index('partial').predicate,'active');assert.equal(index('nullable').nullsNotDistinct,false);assert.equal(index('nulls_equal').nullsNotDistinct,true);assert.equal(index('deferred').immediate,false);assert.equal(index('folded_text').components[0].collation.deterministic,false);assert.deepEqual(index('compound').components.map((r:any)=>r.name),['tenant','id']);assert.deepEqual(index('parent').children,['umf_key_probe.child']);assert.equal(index('expression').components[0].attribute,0);assert.equal(index('expression').expressions,'lower(value)');assert.equal(index('included').keyCount,1);assert.equal(index('included').attributeCount,2);
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/key-postgresql-discovery-native.json',JSON.stringify({scope:'PostgreSQL 17.4 native Key enforcement/comparator/scope discovery only; no binding implementation, ideal admission or equivalence claim',serverVersion:170004,encoding:'UTF8',image:manifest.reference,references:['https://www.postgresql.org/docs/17/ddl-constraints.html','https://www.postgresql.org/docs/17/catalog-pg-index.html','https://www.postgresql.org/docs/17/collation.html'],cases:rows,deferred,indexes,sha256},null,2)+'\n');console.log(JSON.stringify({cases:rows.length,refusals:rows.filter(r=>r.sqlstate!=='00000').length,indexes:indexes.length,deferred,portableBindingImplemented:false}));
}finally{if(created)await run(['docker','rm','-f',name]);}
