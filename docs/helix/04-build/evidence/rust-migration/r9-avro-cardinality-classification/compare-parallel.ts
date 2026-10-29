import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {encodeRequestWire,fromWire} from '../../../../../../bindings/core/node/src/wire.js';
const packet=JSON.parse(readFileSync(new URL('./typescript-predecessor.json',import.meta.url),'utf8'));
const canonical=(v:any):string=>JSON.stringify(v,(_k,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
const all=Object.entries<any>(packet.outcomes);
const selected=all;
const run=(op:string,values:any)=>new Promise<any>((resolve,reject)=>{const p=spawn('/private/tmp/umf-avro-cardinality-target/debug/umf',['avro-cardinality','--stdin-wire'],{env:{PATH:''}});let out='',stderr='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>stderr+=d);p.on('close',code=>{try{if(code)throw Error(stderr||`CLI ${code}`);const env=JSON.parse(out);if(env.status==='error')throw Error(`${env.code}: ${env.message}`);resolve(fromWire(JSON.parse(env.wire)));}catch(e){reject(e)}});p.stdin.end(encodeRequestWire({profile:'umf.avro-cardinality-binding/1.0.0',op,...values}));});
const results:any[]=[];
for(let start=0;start<selected.length;start+=12){
 const batch=selected.slice(start,start+12);
 results.push(...await Promise.all(batch.map(async([id,row])=>{try{const actual=await run('classifyAvroCardinality',{source:row.source,request:row.request});return {id,match:canonical(actual)===canonical(row.result),...(canonical(actual)===canonical(row.result)?{}:{expected:{status:row.result.status,mapping:row.result.mapping,residuals:row.result.residuals,target:row.result.target?.modules.at(-1)},actual:{status:actual.status,mapping:actual.mapping,residuals:actual.residuals,target:actual.target?.modules.at(-1)}})};}catch(e){return {id,error:String(e)}}})));
 console.error(`compared ${results.length}/${selected.length}`);
}
console.log(JSON.stringify({selected:selected.length,results},null,2));
