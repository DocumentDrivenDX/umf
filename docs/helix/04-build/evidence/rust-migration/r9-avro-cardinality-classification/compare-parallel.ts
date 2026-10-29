import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {encodeRequestWire,fromWire} from '../../../../../../bindings/core/node/src/wire.js';
const cli=process.env.UMF_AVRO_CARDINALITY_CLI;
if(!cli)throw Error('Set UMF_AVRO_CARDINALITY_CLI to the reviewed release CLI');
const packet=JSON.parse(readFileSync(new URL('./typescript-predecessor.json',import.meta.url),'utf8'));
function same(a:any,b:any):boolean{
 if(Object.is(a,b))return true;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,i)=>same(value,b[i]));
 if(a&&b&&typeof a==='object'&&typeof b==='object'){
  const keys=Object.keys(a),other=Object.keys(b);return keys.length===other.length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));
 }
 return false;
}
const all=Object.entries<any>(packet.outcomes);
const selected=all;
const run=(op:string,values:any)=>new Promise<any>((resolve,reject)=>{const p=spawn(cli,['avro-cardinality','--stdin-wire'],{env:{PATH:''}});let out='',stderr='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>stderr+=d);p.on('close',(code,signal)=>{try{if(code!==0||signal)throw Error(stderr||`CLI ${code}/${signal}`);const env=JSON.parse(out);if(env.status==='error')throw Error(`${env.code}: ${env.message}`);resolve(fromWire(JSON.parse(env.wire)));}catch(e){reject(e)}});p.stdin.end(encodeRequestWire({profile:'umf.avro-cardinality-binding/1.0.0',op,...values}));});
const results:any[]=[];
for(let start=0;start<selected.length;start+=1){
 const batch=selected.slice(start,start+1);
 results.push(...await Promise.all(batch.map(async([id,row])=>{try{const actual=await run('classifyAvroCardinality',{source:row.source,request:row.request});const match=same(actual,row.result);return {id,match,...(match?{}:{expected:row.result,actual})};}catch(e){return {id,error:String(e)}}})));

}
console.log(JSON.stringify({selected:selected.length,results},null,2));

if(results.some(row=>!row.match))process.exitCode=1;
