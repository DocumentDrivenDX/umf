import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {version,buildASTSchema,validateSchema,parse,print} from 'graphql';
import {projectDddToGraphql} from '../../src';
import {graphqlCases} from './ddd-graphql-cases';
const base='fixtures/projections/ddd-graphql';
assert.equal(version,'17.0.2');
const cases=[];
for(const f of graphqlCases()){
 const p=projectDddToGraphql(f.logical,f.policy,'report');assert.equal(p.status,'reported');
 assert.deepEqual(validateSchema(buildASTSchema(parse(p.candidate!))),[]);
 if(f.id==='shared-authored-graph')assert.equal(print(parse(p.candidate!)),print(parse(readFileSync('fixtures/projections/ddd-authored-relationships/expected-relationships.graphql','utf8'))));
 cases.push({id:f.id,logical:f.logical,policy:f.policy,candidate:p.candidate,fields:Object.fromEntries(Object.entries(buildASTSchema(parse(p.candidate!)).getTypeMap()).filter(([n,t])=>!n.startsWith('__')&&'getFields'in t).map(([n,t])=>[n,Object.fromEntries(Object.entries((t as any).getFields()).map(([f,v])=>[f,String((v as any).type)]))])),report:p});
}
await Bun.write(`${base}/generated.json`,JSON.stringify({graphqlJs:version,cases},null,2)+'\n');
const native=Bun.spawnSync(['.venv/bin/python','scripts/projections/ddd-graphql-native.py'],{stdout:'pipe',stderr:'pipe'});
if(native.exitCode!==0)throw Error(native.stderr.toString());
console.log(native.stdout.toString().trim());
const paths=['spec/projections/ddd-graphql.schema.json','src/projections/ddd-graphql/index.ts','src/projections/ddd-graphql/entities.ts','scripts/projections/ddd-graphql-cases.ts','scripts/projections/ddd-graphql-oracle.ts','scripts/projections/ddd-graphql-native.py','fixtures/projections/ddd-authored-relationships/base.json','fixtures/projections/ddd-authored-relationships/expected-relationships.graphql',`${base}/case.json`,`${base}/generated.json`,`${base}/native.json`];
await Bun.write(`${base}/oracle.json`,JSON.stringify({scope:'Complete schema SDL; GraphQL.js and independent GraphQL-core parse/build/validate; no resolvers or query execution',graphqlJs:version,graphqlCore:'3.2.12',cases:cases.length,sha256:Object.fromEntries(paths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))},null,2)+'\n');
