// SPDX-License-Identifier: MIT OR Apache-2.0
// Installed Linux SDK keyed/unkeyed Pack Tools probe; runs under Node and Bun.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {generatePackTools} from '@umf/core';
const canon=v=>Array.isArray(v)?v.map(canon):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canon(v[k])])):v;
const json=v=>JSON.stringify(canon(v));
const req=keyed=>{
 const pack={id:'linux-probe',version:'1.0.0',schemas:[{id:'items',reference:'items.json',format:'tablespec'}]};
 const table={version:'1.0',table_name:'items',columns:[{name:'id',data_type:'INTEGER',nullable:false},{name:'label',data_type:'VARCHAR',nullable:false}]};
 if(keyed) table.primary_key=['id'];
 return {profile:'umf.pack-tools/1',pack:{id:pack.id,version:pack.version,text:JSON.stringify(pack)},sources:[{id:'items',path:'items.json',format:'json',schemaFormat:'tablespec',text:JSON.stringify(table)}],options:{schema:'public',package:'linux_probe'},targets:['ddl','orm','crud']};
};
const k=generatePackTools(req(true));
assert.equal(k.status,'generated'); assert.equal(k.profile,'umf.pack-tools-result/1');
for(const kind of ['ddl','orm','crud']) assert(k.files.some(f=>f.kind===kind));
const u=generatePackTools(req(false));
assert.equal(u.status,'partial');
assert(u.diagnostics.some(d=>d.code==='PACK_TOOLS_CRUD_KEY_REQUIRED'));
assert(!u.files.some(f=>f.kind==='orm'||f.kind==='crud'));
const h=v=>createHash('sha256').update(json(v)).digest('hex');
console.log(JSON.stringify({status:'passed',runtime:typeof Bun==='undefined'?'node '+process.version:'bun '+Bun.version,arch:process.arch,platform:process.platform,keyedSha256:h(k),unkeyedSha256:h(u),keyedFiles:k.files.map(f=>f.path).sort()}));
