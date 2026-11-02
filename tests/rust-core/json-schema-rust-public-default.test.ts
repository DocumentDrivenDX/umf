// SPDX-License-Identifier: MIT OR Apache-2.0
import {expect,test} from 'bun:test';
import {importJsonSchema,inspectJsonSchema,getJsonSchemaNode,editJsonSchemaNode,exportJsonSchemaBundle,parseNativeJson,parseNativeYaml,jsonSchemaRegistry,validateDocument,UmfError} from '../../src/index-node-v4';
test('JSON Schema default imports, inspects, edits and exports through Rust with native Registry validation',()=>{
 const original=importJsonSchema('{"type":"object","properties":{"name":{"type":"string"}}}',{id:'native-schema',baseUri:'urn:test:schema'});
 expect(inspectJsonSchema(original).valid).toBe(true);
 expect(validateDocument(original,jsonSchemaRegistry()).valid).toBe(true);
 const changed=editJsonSchemaNode(original,'/properties/name/type','"integer"');
 expect(getJsonSchemaNode(changed,'/properties/name/type')).toEqual({kind:'string',value:'integer'});
 expect(exportJsonSchemaBundle(changed).source).toEqual(changed);
 expect(getJsonSchemaNode(original,'/properties/name/type')).toEqual({kind:'string',value:'string'});
 expect(parseNativeJson('9007199254740993')).toEqual({kind:'number',value:'9007199254740993'});
 expect(parseNativeYaml('kind: true').kind).toBe('object');
 expect(()=>editJsonSchemaNode(original,'/missing','true')).toThrow(UmfError);
});
