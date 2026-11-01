// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {importGraphqlSchema,projectGraphqlInputToJsonSchema} from '../../src/index-node-v4';

const text=readFileSync('fixtures/graphql/input-projection.graphql','utf8');
const policy={id:'graphql-input',schemaId:'https://example.test/graphql-input',inputType:'Filter!',list:'array-only',idEncoding:'string-or-integer',lossPolicy:'allow-reported-loss'} as const;

test('Rust GraphQL input projection retains input constraints and blocks non-input types',()=>{
 const source=importGraphqlSchema(text,{id:'graphql-source'});
 const projected=projectGraphqlInputToJsonSchema(source,policy);
 expect(projected.status).toBe('projected');expect(projected.source).toEqual(source);expect(projected.target).toBeDefined();
 expect(projected.issues.some(issue=>issue.code==='INPUT_DEFAULT')).toBe(true);
 expect(projected.issues.some(issue=>issue.code==='LIST_COERCION')).toBe(true);
 const schema=JSON.parse(projected.nativeSchema!);
 expect(projected.nativeSchema).toBe(JSON.stringify(schema,null,2)+'\n');
 expect(schema.$defs.input_0.properties.required.type).toBe('string');
 expect(schema.$defs.input_0.properties.selector.anyOf[0].$ref).toBe('#/$defs/input_1');
 expect(schema.$defs.input_1.minProperties).toBe(1);expect(schema.$defs.input_1.maxProperties).toBe(1);
 const refused=projectGraphqlInputToJsonSchema(source,{...policy,inputType:'Query'});
 expect(refused.status).toBe('blocked');expect(refused.target).toBeUndefined();expect(refused.source).toEqual(source);
 expect(refused.issues.some(issue=>issue.code==='GRAPHQL_INPUT_UNSUPPORTED')).toBe(true);
});
