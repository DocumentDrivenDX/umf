import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {generatePackTools, Registry, registerSagas, inspectSagas, createSagaResources} from '@umf/core';
import {initializeCodegenWasm, initializeWasm} from '@umf/core/runtime/wasm';
const sagaFixture=JSON.parse(readFileSync(process.env.UMF_0109_SAGA_FIXTURE,'utf8'));
const packRequest=JSON.parse(readFileSync(process.env.UMF_0109_PACK_REQUEST,'utf8'));
const packExpected=JSON.parse(readFileSync(process.env.UMF_0109_PACK_EXPECTED,'utf8'));
const authored=sagaFixture.cases.find(row=>row.id==='recipe-declaration')?.source;
assert(authored,'one authored Saga fixture must be present');
const unkeyedRequest=()=>{
 const table={version:'1.0',table_name:'items',columns:[{name:'id',data_type:'INTEGER',nullable:false},{name:'label',data_type:'VARCHAR',nullable:false}]};
 // This is the unchanged unkeyed TableSpec refusal fixture from
 // python/tests/test_pack_tools.py, mirrored for the installed SDK.
 return {profile:'umf.pack-tools/1',pack:{id:'mac-sdk-smoke',version:'1.0.0',text:JSON.stringify({id:'mac-sdk-smoke',version:'1.0.0',schemas:[{id:'items',reference:'items.json',format:'tablespec'}]})},sources:[{id:'items',path:'items.json',format:'json',schemaFormat:'tablespec',text:JSON.stringify(table)}],options:{schema:'public',package:'mac_sdk_smoke'},targets:['ddl','orm','crud']};
};
const keyed=generatePackTools(packRequest);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
assert.deepEqual(canonical(keyed),canonical(packExpected));
assert.equal(keyed.profile,'umf.pack-tools-result/1');
const crud=keyed.files.find(x=>x.kind==='crud'&&x.path==='legal_appellate/crud.py')?.text;
assert(crud?.includes('def create_')&&crud.includes('def delete_')&&!crud.includes('session.commit()'));
const unkeyed=generatePackTools(unkeyedRequest());
assert.equal(unkeyed.status,'partial');
assert(unkeyed.diagnostics.some(x=>x.code==='PACK_TOOLS_CRUD_KEY_REQUIRED'));
assert(!unkeyed.files.some(x=>x.kind==='orm'||x.kind==='crud'));
const omitted=inspectSagas(authored); assert(omitted.validation.valid&&omitted.entries.length>0);
const resources=createSagaResources();
const sagaEngine=await initializeCodegenWasm(undefined,globalThis,resources);
const coreEngine=await initializeWasm(undefined,globalThis,resources);
const bound=registerSagas(new Registry(coreEngine),sagaEngine);
const installed=inspectSagas(authored,bound); assert(installed.validation.valid&&installed.entries.length>0);
console.log(JSON.stringify({profile:'umf.macos-sdk-installed-smoke/1',status:'passed',runtime:typeof Bun==='undefined'?'node':'bun',packTools:{keyed:true,unkeyedRefusal:true,callerOwnedSession:true},saga:{omittedRegistryDefault:true,explicitBoundRegistry:true}}));
