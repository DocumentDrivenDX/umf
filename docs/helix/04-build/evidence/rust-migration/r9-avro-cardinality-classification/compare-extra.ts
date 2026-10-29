import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {encodeRequestWire,fromWire,resultError} from '../../../../../../bindings/core/node/src/wire.js';
const packet=JSON.parse(readFileSync(new URL('./typescript-extra.json',import.meta.url),'utf8'));
const canonical=(v:any):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const run=(row:any)=>new Promise<any>((resolve,reject)=>{const p=spawn('/private/tmp/umf-avro-cardinality-target/debug/umf',['avro-cardinality','--stdin-wire'],{env:{PATH:''}});let out='',stderr='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>stderr+=d);p.on('close',code=>{try{if(code)throw Error(stderr||`CLI ${code}`);const env=JSON.parse(out);if(env.status==='error')return resolve({error:resultError(env)});resolve({result:fromWire(JSON.parse(env.wire))});}catch(e){reject(e)}});p.stdin.end(encodeRequestWire({profile:'umf.avro-cardinality-binding/1.0.0',op:row.op,...row.args}));});
const rows=packet.cases.filter((r:any)=>r.id!=='missing-column');const results:any[]=[];
for(let start=0;start<rows.length;start+=8){results.push(...await Promise.all(rows.slice(start,start+8).map(async(row:any)=>{try{const actual=await run(row);return {id:row.id,match:row.error?actual.error?.code===row.error.code&&actual.error?.message===row.error.message:canonical(actual.result)===canonical(row.result),...(row.error?{expected:row.error,actual:actual.error}:{expected:row.result,actual:actual.result})};}catch(e){return {id:row.id,error:String(e)}}})));console.error(`compared ${results.length}/${rows.length}`)}
console.log(JSON.stringify({cases:rows.length,results},null,2));
