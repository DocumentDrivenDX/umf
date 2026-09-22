/** Host-only pinned native discovery. No ideal classification or binding admission. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {importPostgresqlCatalogCapture,exportPostgresqlCatalogCapture} from '../../src/adapters/postgresql/catalog';
import {readJsonValue,writeJsonValue} from '../../src/model/serialization';
import {copyJson} from '../../src/model/json';
import type {Document} from '../../src/model/types';
const name='umf-facets-postgresql-'+randomUUID();let created=false;
async function run(args:string[],input?:string){
 const child=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});
 const [out,err,code]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);assert.equal(code,0,err||out);return out;
}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(text:string)=>exec(['psql','-X','-q','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],text);
const paths=['native/postgresql/catalog/image.json','native/postgresql/catalog/snapshot.sql','fixtures/postgresql/facets.sql','scripts/core-ideals/facets-postgresql-discovery.ts'];
const manifest=await Bun.file(paths[0]!).json(),query=await Bun.file(paths[1]!).text(),ddl=await Bun.file(paths[2]!).text();
const cases:{id:string;statement:string;sqlstate:string;value:string|null}[]=[];
const add=(id:string,statement:string,value:string|null,sqlstate='00000')=>cases.push({id,statement,sqlstate,value});
const insert=(id:string,table:string,expression:string,value:string|null,sqlstate='00000')=>add(id,`INSERT INTO facet.${table}(value) VALUES (${expression}) RETURNING value::text`,value,sqlstate);
for(const [table,min,max] of [['int16','-32768','32767'],['int32','-2147483648','2147483647'],['int64','-9223372036854775808','9223372036854775807']] as const){
 insert(table+'-minimum',table,min,min);insert(table+'-maximum',table,max,max);
 insert(table+'-below',table,(BigInt(min)-1n).toString(),null,'22003');insert(table+'-above',table,(BigInt(max)+1n).toString(),null,'22003');
}
for(const [table,min,max] of [['signed8',-128,127],['unsigned8',0,255]] as const){for(const n of [min-1,min,max,max+1])insert(table+'-'+n,table,String(n),n<min||n>max?null:String(n),n<min||n>max?'23514':'00000');}
insert('precision-only-rounds','decimal_precision_only','1.5','2');
insert('decimal-round','decimal_pair','1.235','1.24');insert('decimal-negative-round','decimal_pair','-1.235','-1.24');
insert('decimal-round-overflow','decimal_pair','999.995',null,'22003');insert('decimal-max','decimal_pair','999.99','999.99');
insert('decimal-nan','decimal_pair',"'NaN'",'NaN');insert('decimal-infinity','decimal_pair',"'Infinity'",null,'22003');
insert('bare-infinity','decimal_bare',"'Infinity'",'Infinity');insert('bare-negative-infinity','decimal_bare',"'-Infinity'",'-Infinity');
insert('bare-scale','decimal_bare','1.2300','1.2300');insert('negative-scale-round','decimal_negative_scale','12345','12000');
insert('over-scale-round','decimal_over_scale','0.001234','0.00123');insert('over-scale-overflow','decimal_over_scale','0.01',null,'22003');
insert('finite-nan-refusal','decimal_finite',"'NaN'",null,'23514');insert('finite-still-rounds','decimal_finite','1.235','1.24');
for(const [id,value,result,state] of [['exact-round-refusal','1.235',null,'23514'],['exact-trailing-zero','1.2300','1.2300','00000'],['exact-nan-refusal',"'NaN'",null,'23514'],['exact-infinity-refusal',"'Infinity'",null,'23514'],['exact-max','999.99','999.99','00000'],['exact-overflow','1000',null,'23514'],['exact-null','NULL',null,'00000']] as const)insert(id,'decimal_exact',value,result,state);
insert('varchar-emoji','varchar1',"'😀'",'😀');insert('varchar-combining-refusal','varchar1',"U&'e\\0301'",null,'22001');
insert('varchar-combining-two','varchar2',"U&'e\\0301'",'é');insert('varchar-long-refusal','varchar2',"'abc'",null,'22001');
insert('varchar-space-truncation','varchar2',"'a  '",'a ');insert('varchar-explicit-cast','varchar2',"'abc'::varchar(2)",'ab');
add('char-padding',"SELECT octet_length('a'::char(2))::text",'2');add('char-trailing-equality',"SELECT ('a'::char(2) = 'a '::char(2))::text",'true');
add('char-to-text-trims',"SELECT ('a '::char(2))::text",'a');insert('bare-char-default','char_bare',"'ab'",null,'22001');
insert('bare-bpchar','bpchar_bare',"'ab '",'ab');
insert('text-bound-spaces','text_bound',"'a  '",null,'23514');insert('text-bound-emoji','text_bound',"'😀😀'",'😀😀');
insert('text-zero-empty','text_zero',"''",'');insert('text-zero-nonempty','text_zero',"'a'",null,'23514');
insert('text-nul-refusal','text_bound','chr(0)',null,'54000');
insert('binary-nul','binary_bound',"decode('0000','hex')",'\\x0000');insert('binary-overflow','binary_bound',"decode('000000','hex')",null,'23514');
insert('float-narrowing','float32','1.0000000000000002','1');insert('float64-retains','float64','1.0000000000000002','1.0000000000000002');
insert('domain-still-nan','domain_value',"'NaN'",'NaN');insert('domain-positive-refusal','domain_value','-1',null,'23514');
insert('array-element-rounding','array_value',"ARRAY[1.235,2.345]",'{1.24,2.35}');
add('unvalidated-existing-nan','SELECT value::text FROM facet.unvalidated','NaN');insert('unvalidated-new-nan','unvalidated',"'NaN'",null,'23514');
add('nan-comparison',"SELECT ('NaN'::numeric = 'NaN'::numeric AND 'NaN'::numeric > 999.99)::text",'true');
for(const [id,expression,state] of [['invalid-precision','0::numeric(1001,0)','22023'],['invalid-positive-scale','0::numeric(1,1001)','22023'],['invalid-negative-scale','0::numeric(1,-1001)','22023'],['invalid-zero-length',"''::varchar(0)",'22023'],['invalid-maximum-length',"''::varchar(10485761)",'22023']] as const)add(id,'SELECT ('+expression+')::text',null,state);
add('numeric-scale-extremes',"SELECT (pg_typeof(0::numeric(1000,1000)) = pg_typeof(0::numeric(1000,-1000)))::text",'true');
try{
 assert.match(manifest.reference,/^postgres@sha256:[0-9a-f]{64}$/);
 await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',manifest.reference]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{assert.equal((await exec(['cat','/proc/1/comm'])).trim(),'postgres');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}assert.ok(ready);
 assert.equal((await sql('SHOW server_version_num')).trim(),'170004');await sql(ddl);
 const encoding=(await sql('SHOW server_encoding')).trim();assert.equal(encoding,'UTF8');
 const helper=`CREATE FUNCTION pg_temp.probe(statement text) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE value text; BEGIN EXECUTE statement INTO STRICT value; RETURN jsonb_build_object('sqlstate','00000','value',value); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('sqlstate',SQLSTATE,'value',NULL); END $$;`;
 const rows=[];
 for(const row of cases){const result=JSON.parse((await sql(helper+"\nSELECT pg_temp.probe('"+row.statement.replaceAll("'","''")+"');")).trim());assert.deepEqual(result,{sqlstate:row.sqlstate,value:row.value},row.id);rows.push({...row,...result});}
 const snapshot=JSON.parse(await sql(query));
 const columns=JSON.parse(await sql(`SELECT jsonb_agg(jsonb_build_object('table',c.table_name,'column',c.column_name,'dataType',c.data_type,'udt',c.udt_name,'characterLength',c.character_maximum_length,'numericPrecision',c.numeric_precision,'numericRadix',c.numeric_precision_radix,'numericScale',c.numeric_scale) ORDER BY c.table_name,c.ordinal_position) FROM information_schema.columns c WHERE c.table_schema='facet'`));
 const capture={profile:'postgresql-catalog-capture-v1',state:'captured',serverVersion:170004,query,snapshot,reconstruction:{format:'pg-dump-plain-schema-only',toolVersion:(await exec(['pg_dump','--version'])).trim(),sql:await exec(['pg_dump','-U','postgres','--schema-only','postgres'])}};
 const sourceText=' \n'+JSON.stringify(capture,null,2)+'\n',source=importPostgresqlCatalogCapture(sourceText,{id:'postgresql-facet-discovery'}),canonical=exportPostgresqlCatalogCapture(source).json;
 for(const format of ['json','yaml'] as const){const restored=readJsonValue(writeJsonValue(copyJson(source),format),format) as unknown as Document;assert.equal(exportPostgresqlCatalogCapture(restored).json,canonical);}
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-postgresql-discovery-native.json',JSON.stringify({scope:'Pinned native facet counterexamples and catalog-tree recovery; no ideal binding, exact source-text recovery or browser claim',image:manifest.reference,serverVersion:170004,encoding,cases:rows,columns,sourceText,serializationRecoveries:2,sha256},null,2)+'\n');console.log(JSON.stringify({serverVersion:170004,cases:rows.length,rejections:rows.filter(r=>r.sqlstate!=='00000').length,serializationRecoveries:2}));
}finally{if(created)await run(['docker','rm','-f',name]);}
