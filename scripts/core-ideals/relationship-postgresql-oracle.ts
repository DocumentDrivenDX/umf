import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {backend} from '../../native/postgresql/runtime';
import {postgresqlRelationshipCases} from './relationship-postgresql-cases';
import {classifyPostgresqlRelationships,importPostgresqlCatalogCapture,projectRelationshipsToPostgresql,recoverPostgresqlRelationshipSource,recoverRelationshipPostgresqlIdeal,recoverRelationshipPostgresqlNative,readDocument,writeDocument} from '../../src';
import {literal} from '../../src/core-ideals/postgresql-syntax';
const name='umf-relationship-binding-'+randomUUID();let created=false;
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);assert.equal(code,0,err||out);return out;}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(text:string)=>exec(['psql','-X','-q','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],text);
const image=(await Bun.file('native/postgresql/catalog/image.json').json()).reference,query=await Bun.file('native/postgresql/catalog/snapshot.sql').text(),directory='fixtures/postgresql/relationships',rows:any[]=[];
const helper=`CREATE FUNCTION pg_temp.probe(statement text) RETURNS jsonb LANGUAGE plpgsql AS $$ DECLARE value text; BEGIN EXECUTE statement INTO STRICT value; RETURN jsonb_build_object('sqlstate','00000','value',value); EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('sqlstate',SQLSTATE,'value',NULL); END $$;`;
const probe=async(id:string,statement:string,state='00000')=>{const actual=JSON.parse((await sql(helper+'\nSELECT pg_temp.probe('+literal(statement)+');')).trim());assert.equal(actual.sqlstate,state,id+': '+JSON.stringify(actual));return {id,statement,...actual};};
async function capture(id:string){
 const dump=await exec(['pg_dump','-U','postgres','--schema-only','postgres']);
 const capture={profile:'postgresql-catalog-capture-v1',state:'captured',serverVersion:170004,query,snapshot:JSON.parse(await sql('SET search_path=pg_catalog;\n'+query)),reconstruction:{format:'pg-dump-plain-schema-only',toolVersion:(await exec(['pg_dump','--version'])).trim(),sql:dump},futureNative:{counter:'EXACT_NATIVE',meaning:'retain'}};
 const text=JSON.stringify(capture,null,2).replace('"EXACT_NATIVE"','9007199254740993')+'\n';
 const document=importPostgresqlCatalogCapture(text,{id:'catalog-'+id}),classified=await classifyPostgresqlRelationships(document,{profile:'captured-catalog',mode:'report',nativeSource:text},backend);
 assert.equal(classified.status,'classified');for(const format of ['json','yaml'] as const)assert.equal(await recoverPostgresqlRelationshipSource(classified,readDocument(writeDocument(classified.target!,format),format),backend),text);
 assert.ok(classified.observations.every(o=>o.authorIntent==='unknown'));assert.equal(document.modules.some(m=>'relationships'in m),false);
 await Bun.write(`${directory}/${id}.catalog.json`,text);return classified;
}
try{
 assert.match(image,/^postgres@sha256:[0-9a-f]{64}$/);await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust','-e','POSTGRES_INITDB_ARGS=--encoding=UTF8 --locale=C.UTF-8',image]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{assert.equal((await exec(['cat','/proc/1/comm'])).trim(),'postgres');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}assert.ok(ready);assert.equal((await sql('SHOW server_version_num')).trim(),'170004');
 for(const c of postgresqlRelationshipCases()){
  const r=await projectRelationshipsToPostgresql(c.source,c.binding,c.authors,c.request,backend);assert.equal(r.status,c.expected,c.id);if(r.status==='blocked'){rows.push({id:c.id,status:r.status});continue;}
  await sql('DROP SCHEMA IF EXISTS sales CASCADE;\n'+r.nativeSql!);await Bun.write(`${directory}/${c.id}.sql`,r.nativeSql!);
  assert.deepEqual(await recoverRelationshipPostgresqlIdeal(r,r.target!,backend),c.source);assert.equal(await recoverRelationshipPostgresqlNative(r,r.target!,backend),r.nativeSql!);
  const probes:any[]=[];const composite=c.id==='nullable-composite';
  probes.push(await probe('parent',`INSERT INTO sales.customers(id,name${composite?',code':''}) VALUES(1,'customer'${composite?',7':''}) RETURNING 'accepted'::text`));
  probes.push(await probe('source-valid',`INSERT INTO sales.orders(id,tenant,"customerId",status${composite?',"customerCode"':''}) VALUES(10,'tenant',1,'new'${composite?',7':''}) RETURNING 'accepted'::text`));
  probes.push(await probe('source-orphan',`INSERT INTO sales.orders(id,tenant,"customerId",status${composite?',"customerCode"':''}) VALUES(11,'tenant',999,'new'${composite?',7':''}) RETURNING 'accepted'::text`,'23503'));
  if(composite)probes.push(await probe('match-simple-null-exemption',`INSERT INTO sales.orders(id,tenant,"customerId",status,"customerCode") VALUES(12,'tenant',999,'new',NULL) RETURNING 'accepted'::text`));
  probes.push(await probe('product',`INSERT INTO sales.products(id,sku) VALUES(100,'sku') RETURNING 'accepted'::text`));
  if(c.id==='anonymous-junction'){
   probes.push(await probe('junction-valid',`INSERT INTO sales.links("orderId","productId") VALUES(10,100) RETURNING 'accepted'::text`));
   probes.push(await probe('junction-orphan',`INSERT INTO sales.links("orderId","productId") VALUES(10,999) RETURNING 'accepted'::text`,'23503'));
   probes.push(await probe('junction-duplicate-pair',`INSERT INTO sales.links("orderId","productId") VALUES(10,100) RETURNING 'accepted'::text`));
  }else{
   probes.push(await probe('association-valid',`INSERT INTO sales.order_products(id,"orderId","productId",quantity) VALUES(1000,10,100,2.5) RETURNING quantity::text`));
   probes.push(await probe('association-target-orphan',`INSERT INTO sales.order_products(id,"orderId","productId",quantity) VALUES(1001,10,999,2.5) RETURNING 'accepted'::text`,'23503'));
   probes.push(await probe('association-source-orphan',`INSERT INTO sales.order_products(id,"orderId","productId",quantity) VALUES(1002,999,100,2.5) RETURNING 'accepted'::text`,'23503'));
   probes.push(await probe('association-identity',`INSERT INTO sales.order_products(id,"orderId","productId",quantity) VALUES(1000,10,100,8) RETURNING 'accepted'::text`,'23505'));
  }
  const classified=await capture(c.id);assert.equal(classified.observations.length,3);assert.ok(classified.observations.every(o=>o.validated&&o.match==='simple'&&!o.deferrable));
  if(c.id==='alternate-unique-target')assert.deepEqual(classified.observations.find(o=>o.name==='fk_orders_customer')?.targetKeyCandidates,['pk_customers']);
  rows.push({id:c.id,status:r.status,mappings:r.mappings,observations:classified.observations,probes,idealRecovery:true,nativeRecovery:true});
 }
 await sql('DROP SCHEMA IF EXISTS sales CASCADE;');
 let nativeSql=await Bun.file('fixtures/relationship/postgresql-native/constraints.sql').text();nativeSql=nativeSql.replace('ALTER TABLE rel.child ADD CONSTRAINT fk_alt',"INSERT INTO rel.child(id,parent_alt) VALUES(1,'old-orphan');\nALTER TABLE rel.child ADD CONSTRAINT fk_alt");
 nativeSql+='\nCREATE TABLE rel.actions(id integer PRIMARY KEY,parent_id integer REFERENCES rel.parent(id) ON UPDATE CASCADE ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED);\n';await sql(nativeSql);await Bun.write(`${directory}/native-counterexamples.sql`,nativeSql);
 const controls=[];
 controls.push(await probe('not-valid-retains-old-orphan',`SELECT count(*)::text FROM rel.child WHERE parent_alt='old-orphan'`));assert.equal(controls[0]!.value,'1');
 controls.push(await probe('not-valid-checks-new-row',`INSERT INTO rel.child(id,parent_alt) VALUES(2,'new-orphan') RETURNING 'accepted'::text`,'23503'));
 controls.push(await probe('match-simple-partial-null',`INSERT INTO rel.child(id,parent_a,parent_b) VALUES(3,123,NULL) RETURNING 'accepted'::text`));
 controls.push(await probe('match-simple-nonnull-orphan',`INSERT INTO rel.child(id,parent_a,parent_b) VALUES(4,123,456) RETURNING 'accepted'::text`,'23503'));
 controls.push(await probe('alternate-parent',`INSERT INTO rel.parent VALUES(1,'alt',10,20) RETURNING 'accepted'::text`));
 controls.push(await probe('alternate-child',`INSERT INTO rel.child(id,parent_alt,parent_a,parent_b) VALUES(5,'alt',10,20) RETURNING 'accepted'::text`));
 controls.push(await probe('deferred-actions-child',`INSERT INTO rel.actions VALUES(1,1) RETURNING 'accepted'::text`));
 controls.push(await probe('cascade-update',`UPDATE rel.parent SET id=2 WHERE id=1 RETURNING 'accepted'::text`));
 assert.equal((await sql('SELECT parent_id FROM rel.actions')).trim(),'2');
 await sql('DELETE FROM rel.child WHERE id=5;');controls.push(await probe('set-null-delete',`DELETE FROM rel.parent WHERE id=2 RETURNING 'accepted'::text`));assert.equal((await sql('SELECT parent_id IS NULL FROM rel.actions')).trim(),'t');
 const classified=await capture('native-counterexamples');const alt=classified.observations.find(o=>o.name==='fk_alt')!,pair=classified.observations.find(o=>o.name==='fk_pair')!,actions=classified.observations.find(o=>o.sourceTable==='rel.actions')!;
 assert.equal(alt.validated,false);assert.deepEqual(alt.targetKeyCandidates,['parent_alt_key']);assert.equal(pair.match,'simple');assert.deepEqual(pair.targetKeyCandidates,['uq_parent_pair']);assert.equal(actions.onUpdate,'cascade');assert.equal(actions.onDelete,'set-null');assert.equal(actions.deferrable,true);assert.equal(actions.initiallyDeferred,true);
 rows.push({id:'native-counterexamples',observations:classified.observations,probes:controls,nativeRecovery:true});
 const paths=['src/core-ideals/relationship-postgresql.ts','scripts/core-ideals/relationship-postgresql-schema.ts','scripts/core-ideals/relationship-postgresql-cases.ts','scripts/core-ideals/relationship-postgresql-oracle.ts','src/projections/ddd-postgresql/relationship-layout.ts','native/postgresql/catalog/snapshot.sql','native/postgresql/catalog/image.json'];const sha256=Object.fromEntries(await Promise.all(paths.map(async p=>[p,createHash('sha256').update(await Bun.file(p).text()).digest('hex')])));
 await Bun.write('fixtures/validation/relationship-postgresql-native.json',JSON.stringify({scope:'PostgreSQL17.4 new ordinary scalar-keyed tables with FK/junction plus native NOT VALID/MATCH SIMPLE/alternate UNIQUE/actions observations; actual controlled writes only, no deployed-state or native-equivalence claim',serverVersion:170004,image,rows,sha256},null,2)+'\n');console.log(JSON.stringify({cases:rows.length,projected:rows.filter(r=>r.status==='projected').length,probes:rows.flatMap(r=>r.probes??[]).length}));
}finally{if(created)await run(['docker','rm','-f',name]);}
