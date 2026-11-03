// SPDX-License-Identifier: MIT OR Apache-2.0
// Consumer example for the installed @umf/core SDK.
import {generatePackTools} from '@umf/core';
import type {PackToolsRequest,PackToolsResult} from '@umf/core';

const manifest={
  id:'inventory-demo',
  version:'1.0.0',
  schemas:[{id:'items',format:'tablespec',reference:'schemas/items.json'}],
};
const table={
  version:'1.0',
  table_name:'items',
  columns:[
    {name:'item_id',data_type:'INTEGER',nullable:false},
    {name:'label',data_type:'VARCHAR',nullable:false},
  ],
  primary_key:['item_id'],
};
const request:PackToolsRequest={
  profile:'umf.pack-tools/1',
  pack:{id:manifest.id,version:manifest.version,text:JSON.stringify(manifest)},
  sources:[{id:'items',path:'schemas/items.json',format:'json',schemaFormat:'tablespec',text:JSON.stringify(table)}],
  options:{schema:'inventory',package:'inventory_demo'},
  targets:['ddl','orm','crud'],
};

const result:PackToolsResult=generatePackTools(request);
console.log(`${result.status}: ${result.pack.id}@${result.pack.version}`);
for(const file of result.files)console.log(`${file.kind}\t${file.path}`);
for(const source of result.coverage)console.log(`${source.status}\t${source.source}\t${source.operations.join(', ')}`);
for(const diagnostic of result.diagnostics)console.error(`${diagnostic.severity}\t${diagnostic.code}\t${diagnostic.path}\t${diagnostic.message}`);
