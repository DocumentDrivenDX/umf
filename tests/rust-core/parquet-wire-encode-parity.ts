import {encodeParquetWire} from '../../src/adapters/parquet/encode.ts';
import {encodeWire,fromWire} from '../../bindings/core/node/src/wire.js';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
const repo=resolve(import.meta.dirname,'../..');
const cli=process.env.UMF_PARQUET_ENCODE_CLI ?? resolve(repo,'target/debug/umf');
const frozenPath=resolve(repo,'tests/rust-core/fixtures/parquet-wire-encode-ts-freeze.json');
const leaf=[{kind:'bool',value:true},{kind:'bool',value:false},{kind:'i8',value:'-128'},{kind:'i8',value:'127'},{kind:'i16',value:'-32768'},{kind:'i32',value:'2147483647'},{kind:'i64',value:'-9223372036854775808'},{kind:'i64',value:'9223372036854775807'},{kind:'double',bits:'8000000000000000'},{kind:'binary',hex:'00abff'},{kind:'uuid',hex:'00112233445566778899aabbccddeeff'}];
const cases:unknown[]=[...leaf,{kind:'list',elementType:'i8',items:[]},{kind:'list',elementType:'i8',items:Array.from({length:15},()=>leaf[2])},{kind:'set',elementType:'bool',items:[leaf[0],leaf[1]]},{kind:'map',entries:[]},{kind:'map',keyType:'i16',valueType:'binary',entries:[{key:leaf[3],value:leaf[9]}]},{kind:'struct',fields:[{id:1,value:leaf[0]},{id:3,value:leaf[4]},{id:-2,value:leaf[9]}]},{kind:'list',elementType:'struct',items:[{kind:'struct',fields:[{id:1,value:leaf[0]}]}]},
{kind:'i8',value:'00'},{kind:'i8',value:'128'},{kind:'i64',value:'1234567890123456789012'},{kind:'binary',hex:'AB'},{kind:'double',bits:'00'},{kind:'uuid',hex:'0'},{kind:'bool',value:1},{kind:'unknown'},{kind:'bool',value:true,['\ud800']:1},{kind:'list',elementType:'i8',items:[leaf[0]]},{kind:'map',entries:[],keyType:'i8'},{kind:'struct',fields:[{id:40000,value:leaf[0]}]},{kind:'struct',fields:[{id:1,value:leaf[0],['\ud800']:2}]}];
cases.push({kind:'binary',hex:'00'.repeat(1_000_000)});
cases.push(
 {kind:'map',keyType:'i16',valueType:'binary',entries:[{key:leaf[4],value:leaf[9]}]},
 {kind:'struct',fields:[]},
 {kind:'struct',fields:[{id:1,value:leaf[0]},{id:1,value:leaf[1]},{id:-32768,value:leaf[2]}]},
 {kind:'set',elementType:'bool',items:[leaf[0],leaf[0]]},
 {kind:'i8',value:'-0'},
 {kind:'i16',value:'32768'},
 {kind:'i64',value:'1234567890123456789012'},
 {kind:'binary',hex:'0a0'},
 {kind:'map',keyType:'bool',valueType:'i8',entries:[{key:leaf[0],value:leaf[2],['\ud800']:1}]},
 {kind:'struct',fields:[{id:1,value:{...leaf[0],['\udfff']:1}}]},
 {kind:'struct',fields:[{id:1,value:{kind:'bool',value:'yes'}}]},
 {kind:'\ud800',value:true},
);
const observed=[];let failures=[];
for(let i=0;i<cases.length;i++) {
 const v=cases[i];let ts:any;try{ts={status:'ok',hex:Buffer.from(encodeParquetWire(v as any)).toString('hex')}}catch(e:any){ts={status:'error',code:e.code||null,message:e.message,path:e.path??''}}
 observed.push(ts);
 const wire=encodeWire({op:'parquet.encodeWire',value:v});
 const child=spawnSync(cli,['parquet-capture','--stdin-wire'],{input:wire,encoding:'utf8',env:{PATH:''}});
 if(child.status!==0){failures.push({i,cli:child.stderr});continue}
 const r=JSON.parse(child.stdout);const rust=r.status==='ok'?{status:'ok',hex:fromWire(JSON.parse(r.wire))}:{status:'error',code:r.code,message:String.fromCharCode(...r.messageUnits),path:String.fromCharCode(...r.pathUnits)};
 if(JSON.stringify(ts)!==JSON.stringify(rust))failures.push({i,ts,rust});
}
if(process.argv.includes('--freeze'))writeFileSync(frozenPath,JSON.stringify({source:'src/adapters/parquet/encode.ts',outcomes:observed},null,2)+'\n');
else {const frozen=JSON.parse(readFileSync(frozenPath,'utf8')).outcomes;for(let i=0;i<observed.length;i++)if(JSON.stringify(observed[i])!==JSON.stringify(frozen[i]))failures.push({i,oracleDrift:observed[i],frozen:frozen[i]});}
console.log(JSON.stringify({cases:cases.length,failures},null,2));
if(failures.length)process.exit(1);
