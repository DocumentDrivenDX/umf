import {backend} from '../native/postgresql/runtime';
import {importPostgresqlSql,exportPostgresqlSql,proposePostgresqlNodeEdit,readDocument,writeDocument} from '../src';
const cases=[];
for(const file of ['domain.sql','advanced.sql']){
 const source=await Bun.file('fixtures/postgresql/'+file).text();const doc=await importPostgresqlSql(source,backend,{id:file});
 const sql=await exportPostgresqlSql(readDocument(writeDocument(doc,'yaml'),'yaml'),backend);
 cases.push({name:file,source,sql});
}
const source='CREATE TABLE original (id integer);';const doc=await importPostgresqlSql(source,backend,{id:'edit'});const edit=proposePostgresqlNodeEdit(doc,'/stmts/0/stmt/CreateStmt/relation/relname','"changed"');
await Bun.write('fixtures/postgresql/oracle-input.json',JSON.stringify({backend:backend.identity,parserVersion:170004,cases,edit:{source,sql:await exportPostgresqlSql(edit.document,backend)}},null,2)+'\n');
const artifacts=[];for(const path of ['package.json','wasm/libpg-query.wasm','wasm/libpg-query.js','proto.js'])artifacts.push({path,sha256:new Bun.CryptoHasher('sha256').update(await Bun.file('node_modules/@libpg-query/parser/'+path).arrayBuffer()).digest('hex')});
await Bun.write('native/postgresql/runtime-manifest.json',JSON.stringify({package:'@libpg-query/parser',version:'17.6.10',observedPostgresqlVersion:170004,artifacts,adapter:{strategy:'Descriptor-directed nested message construction; Boolean.create bypasses the defective Boolean.fromObject; no global codec patch',sourceSha256:new Bun.CryptoHasher('sha256').update(await Bun.file('native/postgresql/runtime.ts').arrayBuffer()).digest('hex'),schemaSha256:new Bun.CryptoHasher('sha256').update(await Bun.file('spec/extensions/postgresql/native-ast.schema.json').arrayBuffer()).digest('hex')},scope:'Pinned package artifacts and observed raw parser version, not source-build reproducibility or PostgreSQL catalog compatibility'},null,2)+'\n');
console.log('PostgreSQL native oracle inputs generated');
