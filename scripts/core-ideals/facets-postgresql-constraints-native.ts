/** Host-only resolved catalog observations; not a core facet classifier. */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {backend} from '../../native/postgresql/runtime';
import {inspectPostgresqlFacetPredicate} from '../../src/adapters/postgresql/facet-predicate';
const paths=['native/postgresql/catalog/image.json','native/postgresql/catalog/facet-constraints.sql','fixtures/postgresql/facets.sql','fixtures/postgresql/facet-predicate-lookalikes.sql','scripts/core-ideals/facets-postgresql-constraints-native.ts','src/adapters/postgresql/facet-predicate.ts'];
const manifest=await Bun.file(paths[0]!).json(),query=await Bun.file(paths[1]!).text();
const name='umf-facet-checks-'+randomUUID();let created=false;
async function run(args:string[],input?:string){const p=Bun.spawn(args,{stdin:input===undefined?'ignore':new Blob([input]),stdout:'pipe',stderr:'pipe'});const [out,err,code]=await Promise.all([new Response(p.stdout).text(),new Response(p.stderr).text(),p.exited]);assert.equal(code,0,err||out);return out;}
const exec=(args:string[],input?:string)=>run(['docker','exec',...(input===undefined?[]:['-i']),name,...args],input);
const sql=(text:string)=>exec(['psql','-X','-q','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],text);
try{
 assert.match(manifest.reference,/^postgres@sha256:[0-9a-f]{64}$/);
 await run(['docker','run','-d','--name',name,'--network','none','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',manifest.reference]);created=true;
 let ready=false;for(let i=0;i<120;i++){try{assert.equal((await exec(['cat','/proc/1/comm'])).trim(),'postgres');await exec(['pg_isready','-U','postgres']);ready=true;break;}catch{await Bun.sleep(250);}}assert.ok(ready);
 assert.equal((await sql('SHOW server_version_num')).trim(),'170004');
 await sql(await Bun.file(paths[2]!).text());await sql(await Bun.file(paths[3]!).text());
 const capture=JSON.parse(await sql(query));assert.equal(capture.serverVersion,170004);assert.equal(capture.encoding,'UTF8');
 const find=(schema:string,relation:string)=>capture.constraints.find((c:any)=>c.schema===schema&&c.relation===relation);
 assert.ok(find('facet','decimal_exact').functionLookups.some((f:any)=>f.schema==='pg_catalog'&&f.name==='trunc'));
 assert.ok(find('facet','text_bound').functionLookups.some((f:any)=>f.schema==='pg_catalog'&&f.name==='char_length'));
 assert.ok(find('facet_shadow','length_check').functionLookups.some((f:any)=>f.schema==='facet_shadow'&&f.name==='char_length'));
 assert.ok(find('facet_shadow','bound_check').operatorLookups.some((f:any)=>f.schema==='facet_shadow'&&f.name==='<='));
 assert.equal(find('facet','unvalidated').validated,false);assert.deepEqual(find('facet_shadow','multi_column').columnNumbers,[1,2]);
 const rows=[];
 for(const constraint of capture.constraints){const ast=await backend.parse('SELECT '+constraint.expression),inspection=inspectPostgresqlFacetPredicate(ast,'value');rows.push({schema:constraint.schema,relation:constraint.relation,name:constraint.name,inspection});if(constraint.schema==='facet_shadow')assert.equal(inspection.state,'unsupported');}
 const probes=[
  {id:'custom-length-accepts-overlength',sql:"INSERT INTO facet_shadow.length_check VALUES ('abcdef') RETURNING value::text",expected:'abcdef'},
  {id:'custom-trunc-accepts-extra-scale',sql:'INSERT INTO facet_shadow.scale_check VALUES (1.235) RETURNING value::text',expected:'1.235'},
  {id:'custom-operator-accepts-overflow',sql:'INSERT INTO facet_shadow.bound_check VALUES (1000) RETURNING value::text',expected:'1000'},
  {id:'unvalidated-existing-nan',sql:'SELECT value::text FROM facet.unvalidated',expected:'NaN'},
 ];
 const observedProbes=[];
 for(const p of probes){const actual=(await sql(p.sql)).trim();assert.equal(actual,p.expected,p.id);observedProbes.push({...p,actual});}
 const sha256=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(new Uint8Array(await Bun.file(path).arrayBuffer())).digest('hex')])));
 await Bun.write('fixtures/validation/facets-postgresql-constraints-native.json',JSON.stringify({scope:'PostgreSQL 17.4 resolved constraint observations and custom predicate counterexamples. OID lookup extraction does not validate node-tree structure or authorize core facets.',image:manifest.reference,query,capture,rows,probes:observedProbes,sha256},null,2)+'\n');
 console.log(JSON.stringify({constraints:rows.length,candidates:rows.filter(r=>r.inspection.state==='candidate').length,unsupported:rows.filter(r=>r.inspection.state==='unsupported').length,probes:probes.length}));
}finally{if(created)await run(['docker','rm','-f',name]);}
