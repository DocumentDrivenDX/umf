// Focused source-built differential probe; no installed/default/release claim.
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {avroAvailabilitySource} from '../../../../../../scripts/core-ideals/nullability-avro-cases';
import {classifyAvroCardinality} from '../../../../../../src/core-ideals/cardinality-avro';
import {encodeRequestWire,fromWire,resultError} from '../../../../../../bindings/core/node/src/wire.js';
const cli=process.env.UMF_AVRO_CARDINALITY_CLI??'/private/tmp/umf-avro-cardinality-bounded-release/umf';
const binarySha256=createHash('sha256').update(readFileSync(cli)).digest('hex');
if(binarySha256!==(process.env.UMF_AVRO_CARDINALITY_CLI_SHA256??'13ed8bc84f8226f16397b52d04c4634f32b74698c58a7196dd93133b9ebb60f0'))throw Error('Pinned release CLI changed');
const freeze=JSON.parse(readFileSync(new URL('./typescript-extra.json',import.meta.url),'utf8'));
const rows=freeze.cases.filter((r:any)=>['duplicate-named','fixed-unsafe-token','extra-members'].includes(r.id));
for(const [id,type] of [['duplicate-then-unresolved',['long','long','Missing']],['unresolved-utf16','\ud800'],['field-name-utf16',{type:'record',name:'Inner',fields:[{name:'\ud800',type:'long'}]}]] as const){
 const nativeSource=JSON.stringify({type:'record',name:'cardinality.Example',fields:[{name:'value',type}]});
 const input=avroAvailabilitySource(nativeSource,[],'cardinality.Example');
 const args={source:input.source,request:{column:input.column,nativeSource,dependencies:[],identity:{module:'logical',element:'value'},profile:'present-non-null-schema',mode:'report'}};
 try{rows.push({id,op:'classifyAvroCardinality',args,result:classifyAvroCardinality(args.source,args.request as any)});}catch(e:any){rows.push({id,op:'classifyAvroCardinality',args,error:{code:e.code,message:e.message,path:e.path??''}});}
}
const canonical=(v:any):string=>JSON.stringify(v,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);
const results=[];
for(const row of rows){
 const child=spawnSync(cli,['avro-cardinality','--stdin-wire'],{input:encodeRequestWire({profile:'umf.avro-cardinality-binding/1.0.0',op:row.op,...row.args}),env:{PATH:''},timeout:10_000,maxBuffer:4*1024*1024});
 if(child.status!==0||child.signal||child.error)throw Error(`${row.id}: process failed ${child.status}/${child.signal}/${child.error}`);
 const env=JSON.parse(child.stdout.toString()),actual=env.status==='ok'?{result:fromWire(JSON.parse(env.wire))}:{error:resultError(env)};
 const expected=row.error?{error:{code:row.error.code,path:row.error.path??'',message:row.error.message}}:{result:row.result};
 results.push({id:row.id,match:canonical(actual)===canonical(expected),expected,actual});
}
const report={scope:'six focused source-built typed-wire controls; no broader host/installed/default qualification',binarySha256,cases:results.length,matches:results.filter(r=>r.match).length,results};
writeFileSync(process.env.UMF_AVRO_CARDINALITY_PROBE_OUT??'/private/tmp/umf-avro-cardinality-bounded-release/probe.json',JSON.stringify(report,null,2)+'\n');
for(const r of results)console.log(JSON.stringify({id:r.id,match:r.match,...(!r.match?{expectedResiduals:r.expected.result?.residuals,actualResiduals:r.actual.result?.residuals,expectedError:r.expected.error,actualError:r.actual.error}:{})}));
if(results.some(r=>!r.match))process.exitCode=1;
