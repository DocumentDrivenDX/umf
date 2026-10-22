// SPDX-License-Identifier: MIT OR Apache-2.0
import {CURRENT_CORE_VERSION} from '../../src/generated/core-model';
import {expect,test} from 'bun:test';
import requestSchema from '../../spec/compilation/access-request.schema.json';
import resultSchema from '../../spec/compilation/access-result.schema.json';
import manifestSchema from '../../spec/compilation/access-manifest.schema.json';
import {Registry} from '../../src/registry/registry';
import type {JsonObject} from '../../src/model/types';
import {generateAccessPackage} from '../../src/compilation/index';
import {request,profile} from './access-fixtures';
// @covers US-080-AC1
 test('request, candidate/refusal and manifest have closed structural schemas',()=>{
 function validator(id:string,schema:unknown){return new Registry().register({id,version:'0.1.0',coreVersion:CURRENT_CORE_VERSION,description:'Compiler resource schema probe',schema:schema as JsonObject,semantics:'Structural only',scopes:['document'],capabilities:{validation:'structural',directions:[],evidence:[]}}).get(id,'0.1.0')!.structure;}
 const requestCheck=validator('test.access-request',requestSchema),resultCheck=validator('test.access-result',resultSchema),manifestCheck=validator('test.access-manifest',manifestSchema);
 expect(requestCheck(request())).toBe(true);expect(requestCheck({...request(),unknown:true})).toBe(false);
 const r=generateAccessPackage(request(),profile());expect(resultCheck(r)).toBe(true);expect(resultCheck({...r,unknown:true})).toBe(false);expect(manifestCheck(JSON.parse(r.files.find(f=>f.path==='shop/_umf/manifest.json')!.text))).toBe(true);
 const bad=profile();bad.codeSha256='wrong';expect(resultCheck(generateAccessPackage(request(),bad))).toBe(true);
 });
