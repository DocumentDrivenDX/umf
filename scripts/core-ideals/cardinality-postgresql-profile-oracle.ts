/** Native discovery: array layout, domain and JSON boundaries; no binding claim. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
const name='umf-cardinality-postgresql-'+randomUUID();let created=false;
async function run(args:string[],input?:string){
 const p=Bun.spawn(args,{stdin:input===undefined?'ignore':'pipe',stdout:'pipe',stderr:'pipe'});
 if(input!==undefined){await p.stdin!.write(input);await p.stdin!.end();}
 const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);if(code)throw Error(err);return out;
}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(text:string)=>exec(['psql','-X','-q','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],text);
const paths=['native/postgresql/catalog/image.json','fixtures/postgresql/cardinality.sql','scripts/core-ideals/cardinality-postgresql-profile-oracle.ts'];
const manifest=await Bun.file(paths[0]!).json();
const helper=`CREATE FUNCTION pg_temp.probe(statement text) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE value jsonb; BEGIN EXECUTE statement INTO STRICT value; RETURN jsonb_build_object('sqlstate','00000','value',value); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('sqlstate',SQLSTATE,'value',NULL); END $$;`;
const arrays:[string,string,number|null,string|null,unknown,number][]=[
 ['ordered-duplicates','ARRAY[3,1,3]',1,'[1:3]',[3,1,3],3],
 ['empty',"'{}'::integer[]",null,null,[],0],
 ['two-dimensional','ARRAY[[1,2],[3,4]]',2,'[1:2][1:2]',[[1,2],[3,4]],4],
 ['zero-based',"'[0:2]={3,1,3}'::integer[]",1,'[0:2]',[3,1,3],3],
 ['negative-based',"'[-2:0]={3,1,3}'::integer[]",1,'[-2:0]',[3,1,3],3],
 ['null-item','ARRAY[1,NULL,3]',1,'[1:3]',[1,null,3],3],
 ['short','ARRAY[1]',1,'[1:1]',[1],1],
 ['long','ARRAY[1,2,3,4]',1,'[1:4]',[1,2,3,4],4],
 ['sql-null','NULL::integer[]',null,null,null,0],
];
const cases:[string,string,string,unknown][]=[
 ['ragged-array',"SELECT to_jsonb(ARRAY[ARRAY[1],ARRAY[2,3]])",'2202E',null],
 ['domain-item-positive',"INSERT INTO cardinality.domains(items) VALUES(ARRAY[1,2]::cardinality.positive[]) RETURNING to_jsonb(items)",'00000',[1,2]],
 ['domain-item-negative',"INSERT INTO cardinality.domains(items) VALUES(ARRAY[1,-2]::cardinality.positive[]) RETURNING to_jsonb(items)",'23514',null],
 ['domain-item-null',"INSERT INTO cardinality.domains(items) VALUES(ARRAY[1,NULL]::cardinality.positive[]) RETURNING to_jsonb(items)",'00000',[1,null]],
 ['domain-array-rank-two',"INSERT INTO cardinality.domains(vector) VALUES(ARRAY[[1,2],[3,4]]) RETURNING to_jsonb(vector)",'00000',[[1,2],[3,4]]],
 ['json-duplicate',`SELECT to_jsonb((' {"x":1,"x":2} '::json)::text)`,'00000',' {"x":1,"x":2} '],
 ['jsonb-duplicate',`SELECT to_jsonb(('{"x":1,"x":2}'::jsonb)::text)`,'00000','{"x": 2}'],
 ['json-scalar-literal',`INSERT INTO cardinality.json_values VALUES('7') RETURNING to_jsonb(value)`,'00000',7],
 ['int2vector',`INSERT INTO cardinality.vectorish VALUES('1 2 3') RETURNING jsonb_build_object('json',to_jsonb(value),'lower',array_lower(value,1))`,'00000',{json:[1,2,3],lower:0}],
 ['json-scalar-sql-integer','INSERT INTO cardinality.json_values VALUES(7) RETURNING to_jsonb(value)','42804',null],
 ['jsonb-scalar',`INSERT INTO cardinality.jsonb_values VALUES('7') RETURNING to_jsonb(value)`,'00000',7],
 ['object-check-scalar',`INSERT INTO cardinality.jsonb_object VALUES('7') RETURNING value`,'23514',null],
 ['object-check-json-null',`INSERT INTO cardinality.jsonb_object VALUES('null') RETURNING value`,'23514',null],
 ['object-check-sql-null','INSERT INTO cardinality.jsonb_object VALUES(NULL) RETURNING value','00000',null],
 ['object-check-duplicate',`INSERT INTO cardinality.jsonb_object VALUES('{"x":1,"x":2}') RETURNING value`,'00000',{x:2}],
 ['json-nul-key',String.raw`SELECT to_jsonb((' {"\u0000":1} '::json)::text)`,'00000',String.raw` {"\u0000":1} `],
 ['jsonb-nul-key',String.raw`SELECT '{"\u0000":1}'::jsonb`,'22P05',null],
 ['json-large-number',`SELECT to_jsonb(('1e1000000'::json)::text)`,'00000','1e1000000'],
 ['jsonb-large-number',`SELECT '1e1000000'::jsonb`,'22003',null],
];
try{
 assert.match(manifest.reference,/^postgres@sha256:[0-9a-f]{64}$/);
 await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',manifest.reference]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{if((await exec(['cat','/proc/1/comm'])).trim()!=='postgres')throw Error('initializing');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}assert.ok(ready);assert.equal((await sql('SHOW server_version_num')).trim(),'170004');await sql(await Bun.file(paths[1]!).text());
 const rows=[];
 for(const [id,expr,rank,bounds,value,size] of arrays)for(const table of ['declared','sequence']){
  const statement=`WITH x AS (INSERT INTO cardinality.${table} VALUES(${expr}) RETURNING value) SELECT jsonb_build_object('rank',array_ndims(value),'bounds',array_dims(value),'json',to_jsonb(value),'size',coalesce(cardinality(value),0),'text',value::text) FROM x`;
  const result=JSON.parse((await sql(helper+"\nSELECT pg_temp.probe('"+statement.replaceAll("'","''")+"');")).trim());
  const blocked=table==='sequence'&&['two-dimensional','zero-based','negative-based'].includes(id);
  assert.equal(result.sqlstate,blocked?'23514':'00000',id+' '+table);
  if(!blocked){assert.equal(result.value.rank,rank);assert.equal(result.value.bounds,bounds);assert.deepEqual(result.value.json,value);assert.equal(result.value.size,size);}
  rows.push({id:table+'-'+id,statement,...result});
 }
 for(const [id,statement,state,value] of cases){const result=JSON.parse((await sql(helper+"\nSELECT pg_temp.probe('"+statement.replaceAll("'","''")+"');")).trim());assert.equal(result.sqlstate,state,id);assert.deepEqual(result.value,value,id);rows.push({id,statement,...result});}
 const query=`SELECT jsonb_agg(jsonb_build_object('table',c.relname,'column',a.attname,'declaredDimensions',a.attndims,'type',format_type(t.oid,NULL),'schema',tn.nspname,'name',t.typname,'kind',t.typtype,'category',t.typcategory,'element',format_type(NULLIF(t.typelem,0),NULL),'standardArray',coalesce(et.typarray=t.oid,false),'base',format_type(NULLIF(t.typbasetype,0),NULL)) ORDER BY c.relname,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_type t ON t.oid=a.atttypid JOIN pg_namespace tn ON tn.oid=t.typnamespace LEFT JOIN pg_type et ON et.oid=t.typelem WHERE n.nspname='cardinality' AND a.attnum>0 AND NOT a.attisdropped`;
 const catalog=JSON.parse(await sql(query));assert.equal(catalog.find((x:any)=>x.table==='declared').declaredDimensions,1);
 assert.equal(catalog.find((x:any)=>x.table==='domains'&&x.column==='items').element,'cardinality.positive');
 const domain=catalog.find((x:any)=>x.table==='domains'&&x.column==='vector');assert.equal(domain.kind,'d');assert.equal(domain.category,'A');assert.equal(domain.element,null);assert.equal(domain.base,'integer[]');assert.equal(domain.declaredDimensions,0);
 assert.equal(catalog.find((x:any)=>x.table==='declared').standardArray,true);assert.equal(domain.standardArray,false);
 const vector=catalog.find((x:any)=>x.table==='vectorish');assert.equal(vector.category,'A');assert.equal(vector.element,'smallint');assert.equal(vector.standardArray,false);
 const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(new Uint8Array(await Bun.file(p).arrayBuffer())).digest('hex')])));
 const evidence={scope:'PostgreSQL 17.4 native Cardinality profile discovery; no UMF classification/projection or round-trip acceptance',image:manifest.reference,serverVersion:170004,rows,catalog,query,limits:['Declared dimensions are metadata, not rank/length enforcement.','Type category A also includes int2vector; standard array identity requires checking the element type array link, and domains need separate base resolution.','Explicit sequence check permits empty arrays and SQL NULL; availability remains separate.','Catalog element/base resolution is exploratory and not yet a versioned UMF capture supplement.','JSON/JSONB are not unrestricted ideal maps; duplicate-key, NUL and numeric domain differences remain.'],sha256};
 await Bun.write('fixtures/validation/cardinality-postgresql-profile-native.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify({cases:rows.length,rejections:rows.filter(r=>r.sqlstate!=='00000').length,catalogColumns:catalog.length}));
}finally{if(created)await run(['docker','rm','-f',name]);}
