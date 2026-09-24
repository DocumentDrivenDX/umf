import assert from 'node:assert/strict';
import {buildASTSchema,validateSchema,version as graphqlJsVersion} from 'graphql';
import {exportGraphqlSchema,getGraphqlAst,projectDddEntitiesToGraphql,type Document} from '../../src';

const fixture=await Bun.file('fixtures/projections/ddd-graphql-core-fields/case.json').json();
const report=projectDddEntitiesToGraphql(fixture.logical as Document,fixture.policy,'report');
assert.equal(graphqlJsVersion,'17.0.2');
assert.equal(report.status,'reported');assert.equal(report.residuals.length,24);
assert.equal(exportGraphqlSchema(report.targetArchive!),report.candidate);
assert.deepEqual(validateSchema(buildASTSchema(getGraphqlAst(report.targetArchive!))),[]);
await Bun.write('fixtures/projections/ddd-graphql-core-fields/generated.graphql',report.candidate!);
await Bun.write('fixtures/projections/ddd-graphql-core-fields/report.json',JSON.stringify({status:report.status,profile:report.profile,graphqlJs:graphqlJsVersion,residuals:report.residuals,mappings:report.mappings},null,2)+'\n');
console.log(JSON.stringify({types:4,residuals:report.residuals.length}));
