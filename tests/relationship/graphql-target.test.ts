import {expect,test} from 'bun:test';
import {createHash} from 'node:crypto';
import {buildASTSchema,type GraphQLObjectType,validateSchema} from 'graphql';
import {exportGraphqlSchema,getGraphqlAst,importGraphqlSchema,readDocument,writeDocument} from '../../src';

const base='fixtures/projections/ddd-authored-relationships/';

test('@covers US-049-AC3 @covers US-049-AC5: expected SDL carries declared navigations while native import preserves source without author intent',async()=>{
 const source=await Bun.file(base+'expected-relationships.graphql').text();
 const oracle=await Bun.file(base+'expected-graphql-oracle.json').json();
 const browser=await Bun.file(base+'expected-graphql-browser.json').json();
 const archive=importGraphqlSchema(source,{id:'expected-ddd-relationships',mode:'schema'});
 expect(exportGraphqlSchema(archive)).toBe(source);
 for(const format of ['json','yaml'] as const)expect(exportGraphqlSchema(readDocument(writeDocument(archive,format),format))).toBe(source);
 const schema=buildASTSchema(getGraphqlAst(archive));expect(validateSchema(schema)).toEqual([]);
 const fields=(type:string)=>(schema.getType(type) as GraphQLObjectType).getFields();
 expect(String(fields('Order').customer?.type)).toBe('Customer!');
 expect(String(fields('Order').products?.type)).toBe('[Product]');
 expect(String(fields('Customer').orders?.type)).toBe('[Order]');
 expect(String(fields('Product').orders?.type)).toBe('[Order]');
 expect(String(fields('OrderProduct').quantity?.type)).toBe('Decimal!');
 expect(fields('OrderProduct').orders).toBeUndefined();
 expect(Object.values(fields('Order')).every(field=>!field.args.length)).toBe(true);
 expect(archive.modules.some(module=>Object.hasOwn(module,'relationships'))).toBe(false);
 expect(oracle.graphqlJs).toBe('17.0.2');expect(oracle.native.runtime).toBe('GraphQL-core 3.2.12');
 expect(oracle.native.operationsExecuted).toBe(0);
 expect(oracle.sha256[base+'expected-relationships.graphql']).toBe(createHash('sha256').update(source).digest('hex'));
 expect(browser.result.sourceRecovered).toBe(true);expect(browser.result.authoredRelationshipsInferred).toBe(0);
 expect(browser.externalRequests).toEqual([]);
});
