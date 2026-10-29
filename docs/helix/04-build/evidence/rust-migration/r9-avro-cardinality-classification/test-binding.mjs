import {readFileSync} from 'node:fs';
const {executeAvroCardinalityBindingWire,AVRO_CARDINALITY_BINDING_PROFILE}=await import(process.env.UMF_AVRO_CARDINALITY_NODE_ENTRY??new URL('../../../../../../bindings/core/node/index.js',import.meta.url).href);
import {encodeRequestWire,fromWire} from '../../../../../../bindings/core/node/src/wire.js';
const packet=JSON.parse(readFileSync(new URL('./typescript-predecessor.json',import.meta.url),'utf8'));
const extra=JSON.parse(readFileSync(new URL('./typescript-extra.json',import.meta.url),'utf8'));
const row=packet.outcomes['empty-array/present-non-null-schema/strict'];
function same(a,b){if(Object.is(a,b))return true;if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>same(x,b[i]));if(a&&b&&typeof a==='object'&&typeof b==='object'){const keys=Object.keys(a),other=Object.keys(b);return keys.length===other.length&&keys.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]))}return false}
function call(op,fields){const r=JSON.parse(executeAvroCardinalityBindingWire(encodeRequestWire({profile:AVRO_CARDINALITY_BINDING_PROFILE,op,...fields})));if(r.status!=='ok')throw Error(JSON.stringify(r));return fromWire(JSON.parse(r.wire));}
const classified=call('classifyAvroCardinality',{source:row.source,request:row.request});if(!same(classified,row.result))throw Error('classification mismatch');
const verified=call('verifyAvroCardinalityClassification',{receipt:classified,current:classified.target});if(!same(verified,classified))throw Error('verification mismatch');
const recovered=call('recoverAvroCardinalityBundle',{receipt:classified,current:classified.target});if(!same(recovered,row.recovered))throw Error('recovery mismatch');
const changedIds=['duplicate-named','verify-duplicate-named','recover-duplicate-named','fixed-unsafe-token','verify-fixed-unsafe-token','recover-fixed-unsafe-token','fixed-exponent','verify-fixed-exponent','recover-fixed-exponent'];
for(const id of changedIds){const control=extra.cases.find(x=>x.id===id);if(!control?.result)throw Error(`Missing frozen ${id}`);if(!same(call(control.op,control.args),control.result))throw Error(`${id} mismatch`)}
const adversarial=JSON.parse(readFileSync(new URL('./typescript-type-order-utf16.json',import.meta.url),'utf8'));
for(const item of adversarial.cases){
 const value=call(item.op,item.args);if(!same(value,item.result))throw Error(`${item.id} classification mismatch`);
 if(!same(call('verifyAvroCardinalityClassification',{receipt:value,current:value.target}),item.result))throw Error(`${item.id} verify mismatch`);
 if(!same(call('recoverAvroCardinalityBundle',{receipt:value,current:value.target}),{schema:item.args.request.nativeSource,dependencies:item.args.request.dependencies}))throw Error(`${item.id} recovery mismatch`);
}
const controlled=JSON.parse(executeAvroCardinalityBindingWire(encodeRequestWire({profile:AVRO_CARDINALITY_BINDING_PROFILE,op:'classifyAvroCardinality',source:row.source,request:{...row.request,profile:'unresolved',mode:'report'}}),()=>encodeRequestWire({ok:false,code:'TEST_CONTROL',message:'host stopped'})));
if(controlled.status!=='error'||controlled.code!=='TEST_CONTROL')throw Error('control failure was lost');
console.log(JSON.stringify({runtime:typeof Bun==='object'?'bun':'node',profile:AVRO_CARDINALITY_BINDING_PROFILE,classify:true,verify:true,recover:true,changed:changedIds.length,adversarial:adversarial.cases.length*3,controlFailure:true}));
