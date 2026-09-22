import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {projectFacetsToPostgresql,importPostgresqlCatalogCapture,exportPostgresqlCatalogCapture,copyJson,readJsonValue,writeJsonValue,type Document} from '../../src';
import {backend} from '../../native/postgresql/runtime';
import {facetsPostgresqlProjectionCases} from './facets-postgresql-projection-cases';
const paths=['native/postgresql/catalog/image.json','native/postgresql/catalog/snapshot.sql','native/postgresql/catalog/facet-constraints.sql','src/core-ideals/facets-postgresql-projection.ts','spec/core/facets-postgresql-projection.schema.json','scripts/core-ideals/facets-postgresql-projection-cases.ts','scripts/core-ideals/facets-postgresql-projection-native.ts'];
const manifest=await Bun.file(paths[0]!).json(),name='umf-facet-projection-'+randomUUID();let created=false;
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);assert.equal(code,0,err||out);return out;}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(text:string)=>exec(['psql','-X','-q','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],text);
const quote=(text:string)=>"'"+text.replaceAll("'","''")+"'";
const decimal=(n:bigint,scale:number)=>{const negative=n<0n,digits=String(negative?-n:n).padStart(scale+1,'0');return (negative?'-':'')+(scale?digits.slice(0,-scale)+'.'+digits.slice(-scale):digits);};
const canonical=(s:string)=>s.replace(/(\.[0-9]*?)0+$/,'$1').replace(/\.$/,'').replace(/^-0$/,'0');
const projections=[];
for(const row of facetsPostgresqlProjectionCases()){const result=await projectFacetsToPostgresql(row.author,row.request,backend);projections.push({name:row.name,request:row.request,status:result.status,facets:result.mapping.facets,residuals:result.residuals,...(result.nativeSql?{nativeSql:result.nativeSql}:{})});}
const emitted=projections.filter(r=>r.nativeSql),probes:{id:string;statement:string;expected:string|null;reject:boolean}[]=[];
function probe(table:string,id:string,expression:string,expected:string|null,reject=false,returning='value::text'){probes.push({id:table+'-'+id,statement:`INSERT INTO facet_projection."${table}" (value) VALUES (${expression}) RETURNING ${returning}`,expected,reject});}
for(const row of emitted){
 const t=row.request.tableName,f=row.facets;
 probe(t,'null','NULL',null);
 if(f.integerWidth){const b=f.integerWidth.bits,min=f.integerWidth.signed?-(1n<<BigInt(b-1)):0n,max=(1n<<BigInt(b-(f.integerWidth.signed?1:0)))-1n;
  for(const [id,v,reject] of [['min',min,false],['max',max,false],['below',min-1n,true],['above',max+1n,true]] as const)probe(t,id,String(v),reject?null:String(v),reject);
  if(row.request.nativeType==='numeric')probe(t,'fraction','1.5',null,true);
 }
 if(f.precision!==undefined){const max=10n**BigInt(f.precision)-1n,s=f.scale!;
  for(const [id,v,reject] of [['min',-max,false],['max',max,false],['below',-max-1n,true],['above',max+1n,true]] as const){const value=decimal(v,s);probe(t,id,value,reject?null:canonical(value),reject);}
  probe(t,'zero','0','0');
  const extra=decimal(1n,s+1);probe(t,'extra-scale',extra,row.request.encoding==='checked'?null:'0',row.request.encoding==='checked');
  for(const special of ['NaN','Infinity','-Infinity'])probe(t,special,quote(special),null,true);
 }
 if(f.length){const {max,unit}=f.length,fn=unit==='byte'?'octet_length':'char_length';
  for(const [id,n,reject] of [['empty',0,false],['max',max,false],['above',max+1,true]] as const){const expression=unit==='byte'?`decode(repeat('00',${n}),'hex')`:`repeat('a',${n})`;probe(t,id,expression,reject?null:String(n),reject,`pg_catalog.${fn}(value)::text`);}
  if(unit==='unicode-scalar'&&max>=2)probe(t,'unicode',"'😀e'",'2',false,'pg_catalog.char_length(value)::text');
 }
 if(row.name==='facetless-real')probe(t,'float-narrowing','1.0000000000000002','1');
 if(row.name==='facetless-double precision')probe(t,'float-retention','1.0000000000000002','1.0000000000000002');
}
try{
 assert.match(manifest.reference,/^postgres@sha256:[0-9a-f]{64}$/);
 await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',manifest.reference]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{assert.equal((await exec(['cat','/proc/1/comm'])).trim(),'postgres');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}assert.ok(ready);
 assert.equal((await sql('SHOW server_version_num')).trim(),'170004');assert.equal((await sql('SHOW server_encoding')).trim(),'UTF8');
 await sql('CREATE SCHEMA facet_shadow;'+['numeric,numeric','integer,integer','smallint,integer'].map((args,i)=>`CREATE FUNCTION facet_shadow.always_true_${i}(${args}) RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS 'SELECT true';`+['<=','>=','='].map(op=>`CREATE OPERATOR facet_shadow.${op} (LEFTARG=${args.split(',')[0]},RIGHTARG=${args.split(',')[1]},FUNCTION=facet_shadow.always_true_${i});`).join('')).join(''));
 assert.equal((await sql('SET search_path=facet_shadow,pg_catalog; SELECT (1::numeric <= 0::numeric)::text')).trim(),'true');
 await sql('SET search_path=facet_shadow,pg_catalog; CREATE SCHEMA facet_projection;\n'+emitted.map(r=>r.nativeSql).join('\n'));
 const helper=`CREATE FUNCTION pg_temp.probe(statement text) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE value text; BEGIN EXECUTE statement INTO STRICT value; RETURN jsonb_build_object('sqlstate','00000','value',value); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('sqlstate',SQLSTATE,'value',NULL); END $$;`;
 const observed=JSON.parse(await sql('SET search_path=facet_shadow,pg_catalog;\n'+helper+'\nSELECT jsonb_agg(jsonb_build_object(\'id\',id,\'result\',pg_temp.probe(statement))) FROM (VALUES '+probes.map(p=>'('+quote(p.id)+','+quote(p.statement)+')').join(',')+') v(id,statement);'));
 assert.equal(observed.length,probes.length);
 const results=probes.map(p=>{const actual=observed.find((r:any)=>r.id===p.id)!.result;if(p.reject)assert.ok(['23514','22003','22001'].includes(actual.sqlstate),p.id+': '+JSON.stringify(actual));else{assert.equal(actual.sqlstate,'00000',p.id);assert.equal(actual.value===null?null:canonical(actual.value),p.expected,p.id);}return {...p,actual};});
 const query=await Bun.file('native/postgresql/catalog/snapshot.sql').text(),snapshot=JSON.parse(await sql(query));assert.equal(snapshot.relations.length,emitted.length);
 const capture={profile:'postgresql-catalog-capture-v1',state:'captured',serverVersion:170004,query,snapshot,reconstruction:{format:'pg-dump-plain-schema-only',toolVersion:(await exec(['pg_dump','--version'])).trim(),sql:await exec(['pg_dump','-U','postgres','--schema-only','postgres'])}};
 const supplement=JSON.parse(await sql(await Bun.file('native/postgresql/catalog/facet-constraints.sql').text()));
 const source=importPostgresqlCatalogCapture(JSON.stringify(capture),{id:'projected-facets'}),original=exportPostgresqlCatalogCapture(source).json;
 for(const format of ['json','yaml'] as const){const restored=readJsonValue(writeJsonValue(copyJson(source),format),format) as unknown as Document;assert.equal(exportPostgresqlCatalogCapture(restored).json,original);}
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 const counts={cases:projections.length,emitted:emitted.length,blocked:projections.length-emitted.length,probes:results.length,rejections:results.filter(r=>r.reject).length,catalogRecoveries:2};
 await Bun.write('fixtures/validation/facets-postgresql-projection-native.json',JSON.stringify({scope:'Emitted PostgreSQL 17.4 DDL execution, bounded native value probes and catalog-tree recovery; no arbitrary SQL input conversion or full binding acceptance',image:manifest.reference,serverVersion:170004,encoding:'UTF8',ambientOperatorShadow:true,counts,projections,results,capture,supplement,sha256},null,2)+'\n');console.log(JSON.stringify(counts));
}finally{if(created)await run(['docker','rm','-f',name]);}
