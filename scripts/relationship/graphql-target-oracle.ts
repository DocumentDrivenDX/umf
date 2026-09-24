import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildASTSchema,validateSchema,version as graphqlJsVersion} from 'graphql';
import {exportGraphqlSchema,getGraphqlAst,importGraphqlSchema,readDocument,writeDocument} from '../../src';

const base='fixtures/projections/ddd-authored-relationships/';
const source=await Bun.file(base+'expected-relationships.graphql').text();
const graph=await Bun.file(base+'base.json').json();
assert.equal(graphqlJsVersion,'17.0.2');
const archive=importGraphqlSchema(source,{id:'expected-ddd-relationships',mode:'schema'});
assert.equal(exportGraphqlSchema(archive),source);
const schema=buildASTSchema(getGraphqlAst(archive));
assert.deepEqual(validateSchema(schema),[]);
for(const format of ['json','yaml'] as const)assert.equal(exportGraphqlSchema(readDocument(writeDocument(archive,format),format)),source);
assert(archive.modules.every(module=>!Object.hasOwn(module,'relationships')));
for(const proposal of graph.relationshipProposals){
 const sourceType=schema.getType(proposal.assertion.source[0].element) as any;
 assert(sourceType?.getFields()[proposal.assertion.name]);
 const inverse=proposal.assertion.inverse,targetType=schema.getType(proposal.assertion.target[0].element) as any;
 if(inverse)assert(targetType?.getFields()[inverse]);
}
const process=Bun.spawn(['/home/erik/Projects/umf/.venv/bin/python','scripts/relationship/graphql-target-native.py'],{stdout:'pipe',stderr:'pipe'});
const [stdout,stderr,code]=await Promise.all([new Response(process.stdout).text(),new Response(process.stderr).text(),process.exited]);
assert.equal(code,0,stderr||stdout);
const native=JSON.parse(stdout);
const files=[base+'expected-relationships.graphql',base+'base.json','scripts/relationship/graphql-target-native.py'];
const sha256=Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(new Uint8Array(await Bun.file(file).arrayBuffer())).digest('hex')])));
await Bun.write(base+'expected-graphql-oracle.json',JSON.stringify({
 scope:'Hand-authored expected GraphQL SDL target; native parser/schema/adapter evidence only, no generator or resolver/query execution claim',
 graphqlJs:graphqlJsVersion,native,sourceRecovered:true,authoredRelationshipsInferred:0,
 residualObligations:['target key resolution','source-end participation','target lifecycle','OrderProduct association identity/attributes'],sha256,
},null,2)+'\n');
console.log({graphqlJs:graphqlJsVersion,graphqlCore:native.runtime,definitions:native.definitions});
