// SPDX-License-Identifier: MIT OR Apache-2.0
import {test,expect} from 'bun:test';
import {createValidator} from '../../src/validation/schema';
import {validateDocument} from '../../src/validation/document';
import {copyJson} from '../../src/model/json';
import {declareCoreSemanticTypes,getCoreSemanticTypes} from '../../src/model/semantic-types';
import schema from '../../spec/core/schema.json';
import type {Document} from '../../src/model/types';
const term={vocabulary:'example.identity',version:'2026-10',term:'external-id'};
const source=():Document=>({umf:'0.10.0',id:'exact-model',vocabularies:{native:{version:'9.1.0'}},modules:[{id:'m',namespace:'example',elements:[{id:'id',kind:'field',scalarType:'uuid',nullability:'required',cardinality:'one',examples:[{uuid:'01234567-89ab-cdef-8123-456789abcdef'}],allowedValues:[{uuid:'01234567-89ab-cdef-8123-456789abcdef'}],default:{value:{uuid:'01234567-89ab-cdef-8123-456789abcdef'},on:'missing'},extensions:{native:{original:'untouched'}}},{id:'bits',kind:'field',scalarType:'bits128',nullability:'required',cardinality:'one',examples:[{bits128Hex:'ffffffffffffffffffffffffffffffff'}],extensions:{}},{id:'record',kind:'record',members:[{module:'m',element:'id'},{module:'m',element:'bits'}],keys:[{id:'pk',name:'primary',fields:[{module:'m',element:'id'}]}],extensions:{}}]}]});
test('generated current schema and document validator compose UUID, bits128 and semantic references',()=>{
 expect(schema.$id).toBe('urn:umf:core:0.10.0');const validator=createValidator();const check=validator.compile(schema);const doc=source();expect(check(doc)).toBe(true);expect(validateDocument(doc).valid).toBe(true);
 const authored=declareCoreSemanticTypes(doc,{module:'m',element:'id'},[term]).target;expect(validateDocument(authored).valid).toBe(true);expect(getCoreSemanticTypes(authored,{module:'m',element:'id'})).toEqual([term]);
 const bad=copyJson(authored) as unknown as Document;bad.modules[0]!.elements[0]!.examples=[{uuid:'invalid'}];expect(validateDocument(bad).valid).toBe(false);
});
