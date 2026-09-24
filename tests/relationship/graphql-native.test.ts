import {expect,test} from 'bun:test';
import {buildASTSchema,validateSchema} from 'graphql';
import {exportGraphqlSchema,getGraphqlAst,importGraphqlSchema,readDocument,writeDocument} from '../../src';

const directory='fixtures/relationship/graphql-native';
const source=await Bun.file(`${directory}/schema.graphql`).text();
const oracle=await Bun.file(`${directory}/oracle.json`).json();

test('@covers US-045-AC5 @covers US-045-AC7: object-returning SDL fields stay native observations',()=>{
  const archive=importGraphqlSchema(source,{id:'native-graphql-object-fields',mode:'schema'});
  expect(exportGraphqlSchema(archive)).toBe(source);
  expect(validateSchema(buildASTSchema(getGraphqlAst(archive)))).toEqual([]);
  for(const format of ['json','yaml'] as const)
    expect(exportGraphqlSchema(readDocument(writeDocument(archive,format),format))).toBe(source);
  expect(archive.modules.some(module=>'relationships'in module)).toBe(false);
});

test('@covers US-045-AC5: two native object fields with the same type do not prove association intent',()=>{
  expect(oracle.graphqlCore).toBe('3.2.12');expect(oracle.graphqlJs).toBe('17.0.2');
  expect(oracle.objectFields).toContain('Order.customer');
  expect(oracle.objectFields).toContain('Order.computedCustomer');
  expect(oracle.authoredRelationships).toBe(0);
});
