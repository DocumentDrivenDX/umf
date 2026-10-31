import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {encodeRequestWire,fromWire,resultError} from '../../../../../../bindings/core/node/src/wire.js';
const cli=process.env.UMF_AVRO_CARDINALITY_CLI;
if(!cli)throw Error('Set UMF_AVRO_CARDINALITY_CLI to the reviewed release CLI');
const packet=JSON.parse(readFileSync(new URL('./typescript-extra.json',import.meta.url),'utf8'));
function assertJsonTree(value:any,path=''):void{
 if(value===null||typeof value==='string'||typeof value==='boolean')return;
 if(typeof value==='number'&&Number.isFinite(value))return;
 if(Array.isArray(value)){for(let i=0;i<value.length;i++){if(!(i in value))throw Error(`Sparse array at ${path}/${i}`);assertJsonTree(value[i],`${path}/${i}`)}return}
 if(typeof value==='object'&&(Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null)){for(const key of Object.keys(value))assertJsonTree(value[key],`${path}/${key}`);return}
 throw Error(`Non-JSON value at ${path}: ${typeof value}`);
}
function same(a:any,b:any):boolean{
 assertJsonTree(a);assertJsonTree(b);
 if(Object.is(a,b))return true;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((value,i)=>same(value,b[i]));
 if(a&&b&&typeof a==='object'&&typeof b==='object'){
  const keys=Object.keys(a),other=Object.keys(b);return keys.length===other.length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));
 }
 return false;
}
const run=(row:any)=>new Promise<any>((resolve,reject)=>{const p=spawn(cli,['avro-cardinality','--stdin-wire'],{env:{PATH:''}});let out='',stderr='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>stderr+=d);p.on('close',(code,signal)=>{try{if(code!==0||signal)throw Error(stderr||`CLI ${code}/${signal}`);const env=JSON.parse(out);if(env.status==='error')return resolve({error:resultError(env)});resolve({result:fromWire(JSON.parse(env.wire))});}catch(e){reject(e)}});p.stdin.end(encodeRequestWire({profile:'umf.avro-cardinality-binding/1.0.0',op:row.op,...row.args}));});
const rows=packet.cases.filter((r:any)=>r.id!=='missing-column');const results:any[]=[];
for(let start=0;start<rows.length;start+=1){results.push(...await Promise.all(rows.slice(start,start+1).map(async(row:any)=>{try{assertJsonTree(row.args);const actual=await run(row);const expectedWireError=row.error?Object.fromEntries(Object.entries(row.error).filter(([key])=>key!=='name')):undefined;return {id:row.id,match:row.error?row.error.name==='UmfError'&&same(actual.error,expectedWireError):same(actual.result,row.result),...(row.error?{expected:row.error,actual:actual.error}:{expected:row.result,actual:actual.result})};}catch(e){return {id:row.id,error:String(e)}}})));}
console.log(JSON.stringify({cases:rows.length,results},null,2));

if(results.some(row=>!row.match))process.exitCode=1;
