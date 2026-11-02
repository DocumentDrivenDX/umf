// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {projectDddEntitiesToGraphql,projectDddToGraphql,verifyDddGraphqlProjection,recoverDddFromGraphql,recoverDddGraphqlNative,importGraphqlSchema,type Document} from '../../src/index-node-v4';
import {graphqlCases} from '../../scripts/projections/ddd-graphql-cases';
import entityFixture from '../../fixtures/projections/ddd-graphql-entities/case.json';
import type {DddGraphqlEntityPolicy} from '../../src/projections/ddd-graphql/entities';

test('Node V4 DDD GraphQL public roots lower, verify, recover, and refuse through Rust',()=>{
 const f=graphqlCases()[0]!;
 const report=projectDddToGraphql(f.logical,f.policy,'report');
 expect(report.status).toBe('reported');
 const strict=projectDddToGraphql(f.logical,f.policy,'strict');
 expect(strict.status).toBe('blocked');
 expect(strict.diagnostics.length).toBe(strict.residuals.length);
 expect(report.candidate).toContain('customer: Customer');
 expect(report.candidate).toContain('tags: [String!]');
 expect(report.residuals.some(r=>r.path.endsWith('/targetMultiplicity'))).toBe(true);
 expect(report.targetArchive).toBeDefined();
 const customInteger=projectDddToGraphql(f.logical,{...f.policy,scalars:{...f.policy.scalars,integer:'WholeNumber'}},'report');
 expect(customInteger.candidate).toContain('scalar WholeNumber');
 const fresh=importGraphqlSchema(report.candidate!,{id:'fresh-native',mode:'schema'});
 expect(verifyDddGraphqlProjection(report,fresh)).toEqual(report);
 expect(recoverDddFromGraphql(report,fresh)).toEqual(f.logical);
 expect(recoverDddGraphqlNative(report,fresh)).toBe(report.candidate!);
 const entities=projectDddEntitiesToGraphql(entityFixture.logical as unknown as Document,entityFixture.policy as DddGraphqlEntityPolicy,'report');
 expect(entities.candidate).toContain('type Customer');
 expect(()=>projectDddToGraphql(f.logical,{...f.policy,entities:[]},'report')).toThrow('At least one entity');
});
