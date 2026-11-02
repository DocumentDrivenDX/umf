// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {importTypeSpecSources,projectTypeSpecToJsonSchema} from '../../src/index-node-v4';

const policy={id:'typespec-projection',rootFile:'@typespec/json-schema/Person.json',retrievalBase:'https://example.test/emission/',options:{'file-type':'json','int64-strategy':'string'},usage:'native-emission' as const,lossPolicy:'allow-reported-loss' as const};

test('public TypeSpec JSON Schema projection preserves emitted resources and Rust-owned refusal',async()=>{
 const source=importTypeSpecSources({entrypoint:'main.tsp',files:{'main.tsp':await Bun.file('fixtures/typespec/upstream/emitters/json-schema/main.tsp').text()},libraries:{'@typespec/json-schema':'1.16.0'}},{id:'typespec-source'});
 const result=await projectTypeSpecToJsonSchema(source,policy);
 expect(result.status).toBe('projected');expect(result.complete).toBe(false);expect(result.source).toEqual(source);expect(result.target).toBeDefined();
 expect(result.resources).toHaveLength(3);expect(result.emission.files[policy.rootFile]).toBeDefined();
 expect(result.issues.map(issue=>issue.code)).toContain('TYPESPEC_UNREVIEWED_SEMANTICS');
 const strict=await projectTypeSpecToJsonSchema(source,{...policy,lossPolicy:'strict'});
 expect(strict.status).toBe('blocked');expect(strict.target).toBeUndefined();expect(strict.emission.status).toBe('emitted');
 await expect(projectTypeSpecToJsonSchema(source,{...policy,retrievalBase:'relative/'})).rejects.toThrow('Retrieval base');
},120_000);
