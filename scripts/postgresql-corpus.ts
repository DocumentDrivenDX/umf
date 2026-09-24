import {createHash} from 'node:crypto';
import {backend} from '../native/postgresql/runtime';
import {importPostgresqlSql,exportPostgresqlSql,writeDocument,readDocument,getPostgresqlNode,getPostgresqlSource,validatePostgresqlAst} from '../src';
const base='fixtures/postgresql/upstream/';const manifest=await Bun.file(base+'manifest.json').json();
for(const f of manifest.files)if(createHash('sha256').update(await Bun.file(base+f.file).bytes()).digest('hex')!==f.sha256)throw Error('Fixture hash mismatch '+f.file);
const cases=await Bun.file(base+'deparse-cases.json').json();if(cases.length!==416||manifest.cases!==416)throw Error('Incomplete upstream corpus');const results=[];
for(const c of cases){
 let stage='import';
 try{
  const doc=await importPostgresqlSql(c.sql,backend,{id:c.id});
  stage='typed-schema';const validation=validatePostgresqlAst(await backend.parse(c.sql));if(!validation.valid)throw Error(JSON.stringify(validation.errors));
  stage='UMF-serialization';for(const format of ['json','yaml'] as const){const restored=readDocument(writeDocument(doc,format),format);if(getPostgresqlSource(restored)!==c.sql)throw Error('UMF source archive changed');if(JSON.stringify(getPostgresqlNode(restored,''))!==JSON.stringify(getPostgresqlNode(doc,'')))throw Error('UMF tree changed');}
  stage='native-export';const sql=await exportPostgresqlSql(doc,backend);
  results.push({id:c.id,status:'round-trip',sql});
 }catch(error){results.push({id:c.id,status:'blocked',stage,code:(error as any).code??'NATIVE',message:(error as Error).message});}
}
const report={package:backend.identity,adapterSha256:createHash('sha256').update(await Bun.file('native/postgresql/runtime.ts').bytes()).digest('hex'),postgresql:170004,upstream:manifest.commit,cases:cases.length,roundTrips:results.filter(r=>r.status==='round-trip').length,blocked:results.filter(r=>r.status==='blocked').length,results};
await Bun.write('fixtures/postgresql/corpus-results.json',JSON.stringify(report,null,2)+'\n');console.log({...report,results:report.results.filter(r=>r.status==='blocked')});

if(report.blocked)throw Error('Upstream corpus contains blocked cases; inspect the recorded report');
