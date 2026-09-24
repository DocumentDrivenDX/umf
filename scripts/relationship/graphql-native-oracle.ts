import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildASTSchema,validateSchema,version as graphqlJsVersion} from 'graphql';
import {exportGraphqlSchema,getGraphqlAst,importGraphqlSchema,readDocument,writeDocument} from '../../src';

const directory='fixtures/relationship/graphql-native';
const source=await Bun.file(`${directory}/schema.graphql`).text();
const archive=importGraphqlSchema(source,{id:'native-graphql-object-fields',mode:'schema'});
assert.equal(graphqlJsVersion,'17.0.2');
assert.equal(exportGraphqlSchema(archive),source);
assert.deepEqual(validateSchema(buildASTSchema(getGraphqlAst(archive))),[]);
for(const format of ['json','yaml'] as const)
  assert.equal(exportGraphqlSchema(readDocument(writeDocument(archive,format),format)),source);
assert.equal(archive.modules.some(module=>'relationships'in module),false);
const sha256=Object.fromEntries(await Promise.all([`${directory}/schema.graphql`,'scripts/relationship/graphql-native-oracle.ts'].map(async file=>[file,createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex')])));
await Bun.write(`${directory}/adapter.json`,JSON.stringify({scope:'GraphQL SDL object fields are native observations; association or computed behavior is not authored by import',graphqlJs:graphqlJsVersion,sourceRecovery:{json:true,yaml:true,exact:true},authoredRelationships:0,sha256},null,2)+'\n');
console.log(JSON.stringify({graphqlJs:graphqlJsVersion,authoredRelationships:0}));
