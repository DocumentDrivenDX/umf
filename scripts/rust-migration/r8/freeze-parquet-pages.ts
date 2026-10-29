// SPDX-License-Identifier: MIT OR Apache-2.0
// Frozen public outcomes. The source field is reconstructed from the pinned
// fixture bytes and case ID so the original payload is not duplicated.
import {createHash} from 'node:crypto';
import {captureParquet} from '../../../src/adapters/parquet/index';
import {inspectParquetPages} from '../../../src/adapters/parquet/pages';
import {decodeParquetPageBodies} from '../../../src/adapters/parquet/bodies';

const negative=(await Bun.file('fixtures/parquet/pages/negative/manifest.json').json()).cases;
const bodies=(await Bun.file('fixtures/parquet/bodies/results.json').json()).results;
const selected=new Set(['page-1.0-dict-true','page-2.0-dict-true','page-2.0-dict-false','rename-none','rename-snappy','rename-gzip']);
const fixtures=[...negative,...bodies.filter((c:any)=>selected.has(c.id)),
 {id:'snappy-prefix-corruption',path:'fixtures/parquet/values-trial/page-1.0-dict-false.parquet',mutation:{offset:52,xor:1}},
 {id:'malformed-page-header-varint',path:'fixtures/parquet/pages/negative/valid-v1.parquet',mutation:{offset:7,bytes:[255,255,255,255,255]}},
 ...Object.entries({unknownWire:[31],invalidBoolean:[25,17,0],oversizedBinary:[24,127],oversizedLength:[24,255,255,255,255,15],unknownEmptyList:[25,15],unknownMapKey:[27,1,245],fieldIdOverflow:[5,254,255,3,0,245,0]}).map(([id,bytes])=>({id,path:'fixtures/parquet/pages/negative/valid-v1.parquet',mutation:{offset:4,bytes}})),
 {id:'snappy-zero-overflow',path:'fixtures/parquet/bodies/snappy-zero-overflow.parquet'}];
const cases=[];
for(const c of fixtures){
 const bytes=new Uint8Array(await Bun.file(c.path).arrayBuffer());
 const baseSha256=createHash('sha256').update(bytes).digest('hex');
 if(c.mutation){if(c.mutation.bytes)bytes.set(c.mutation.bytes,c.mutation.offset);else bytes[c.mutation.offset]=bytes[c.mutation.offset]!^c.mutation.xor;}
 const document=captureParquet(bytes,{id:c.id});
 const page=inspectParquetPages(document),body=decodeParquetPageBodies(document);
 const {source:_pageSource,...pageOutcome}=page;
 const {source:_bodySource,...bodyOutcome}=body;
 cases.push({id:c.id,path:c.path,...(c.mutation?{baseSha256,mutation:c.mutation}:{}),sha256:createHash('sha256').update(bytes).digest('hex'),page:pageOutcome,body:bodyOutcome});
}
await Bun.write('tests/rust-core/fixtures/parquet-pages-bodies-ts-freeze.json',JSON.stringify({profile:'umf-r8-parquet-pages-bodies-ts-freeze/1',cases},null,2)+'\n');
console.log(JSON.stringify({cases:cases.length,pageChecked:cases.filter(c=>c.page.status==='checked').length,bodyDecoded:cases.filter(c=>c.body.status==='decoded').length}));
